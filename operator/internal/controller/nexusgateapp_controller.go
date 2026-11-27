/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gatewayv1alpha1 "github.com/EM-GeekLab/nexusgate-operator/api/v1alpha1"
	"github.com/EM-GeekLab/nexusgate-operator/internal/nexusgate"
)

const (
	// finalizerName is the finalizer used by this controller
	finalizerName = "nexusgateapp.gateway.nexusgate.io/finalizer"
	// requeueInterval is the default requeue interval for periodic sync
	requeueInterval = 5 * time.Minute
)

// NexusGateAppReconciler reconciles a NexusGateApp object
type NexusGateAppReconciler struct {
	client.Client
	Scheme      *runtime.Scheme
	NexusGate   *nexusgate.Client
	ClusterName string
}

// +kubebuilder:rbac:groups=gateway.nexusgate.io,resources=nexusgateapps,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=gateway.nexusgate.io,resources=nexusgateapps/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=gateway.nexusgate.io,resources=nexusgateapps/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
func (r *NexusGateAppReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Fetch the NexusGateApp instance
	var app gatewayv1alpha1.NexusGateApp
	if err := r.Get(ctx, req.NamespacedName, &app); err != nil {
		if errors.IsNotFound(err) {
			// Object not found, return without requeuing
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch NexusGateApp")
		return ctrl.Result{}, err
	}

	// Handle deletion
	if !app.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, &app)
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(&app, finalizerName) {
		controllerutil.AddFinalizer(&app, finalizerName)
		if err := r.Update(ctx, &app); err != nil {
			log.Error(err, "unable to add finalizer")
			return ctrl.Result{}, err
		}
		return ctrl.Result{Requeue: true}, nil
	}

	// Reconcile the NexusGateApp
	return r.reconcile(ctx, &app)
}

// reconcile handles the main reconciliation logic
func (r *NexusGateAppReconciler) reconcile(ctx context.Context, app *gatewayv1alpha1.NexusGateApp) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Update status to Pending if not set
	if app.Status.Phase == "" {
		app.Status.Phase = gatewayv1alpha1.PhasePending
		if err := r.Status().Update(ctx, app); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Build external ID
	externalID := r.buildExternalID(app)
	log.Info("reconciling NexusGateApp", "externalID", externalID)

	// Ensure API key exists in NexusGate
	apiKeyResp, err := r.NexusGate.EnsureAPIKey(ctx, externalID, app.Spec.AppName)
	if err != nil {
		log.Error(err, "failed to ensure API key")
		return r.updateStatusError(ctx, app, fmt.Sprintf("failed to ensure API key: %v", err))
	}

	log.Info("API key ensured", "id", apiKeyResp.ID, "created", apiKeyResp.Created)

	// Sync the API key to the Secret
	if err := r.syncSecret(ctx, app, apiKeyResp.Key); err != nil {
		log.Error(err, "failed to sync secret")
		return r.updateStatusError(ctx, app, fmt.Sprintf("failed to sync secret: %v", err))
	}

	// Update status to Ready
	now := metav1.Now()
	app.Status.Phase = gatewayv1alpha1.PhaseReady
	app.Status.APIKeyID = apiKeyResp.ID
	app.Status.APIKeyPrefix = maskAPIKey(apiKeyResp.Key)
	app.Status.SecretSynced = true
	app.Status.LastSyncTime = &now
	app.Status.Message = "API key provisioned and synced successfully"

	if err := r.Status().Update(ctx, app); err != nil {
		log.Error(err, "failed to update status")
		return ctrl.Result{}, err
	}

	// Requeue for periodic sync to detect revoked keys
	return ctrl.Result{RequeueAfter: requeueInterval}, nil
}

// handleDeletion handles the deletion of the NexusGateApp
func (r *NexusGateAppReconciler) handleDeletion(ctx context.Context, app *gatewayv1alpha1.NexusGateApp) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if !controllerutil.ContainsFinalizer(app, finalizerName) {
		return ctrl.Result{}, nil
	}

	// Update status to Deleting
	app.Status.Phase = gatewayv1alpha1.PhaseDeleting
	if err := r.Status().Update(ctx, app); err != nil {
		return ctrl.Result{}, err
	}

	// Handle deletion based on policy
	if app.Spec.DeletionPolicy == gatewayv1alpha1.DeletionPolicyRevoke {
		externalID := r.buildExternalID(app)
		log.Info("revoking API key due to deletion policy", "externalID", externalID)

		// Get the API key first
		apiKeyResp, err := r.NexusGate.GetAPIKeyByExternalID(ctx, externalID)
		if err != nil {
			log.Error(err, "failed to get API key for revocation")
			// Continue with deletion even if we can't get the key
		} else if apiKeyResp != nil && !apiKeyResp.Revoked {
			// Revoke the key
			if err := r.NexusGate.RevokeAPIKey(ctx, apiKeyResp.Key); err != nil {
				log.Error(err, "failed to revoke API key")
				// Continue with deletion even if revocation fails
			} else {
				log.Info("API key revoked successfully")
			}
		}
	} else {
		log.Info("retaining API key due to deletion policy")
	}

	// Remove finalizer
	controllerutil.RemoveFinalizer(app, finalizerName)
	if err := r.Update(ctx, app); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("NexusGateApp deleted successfully")
	return ctrl.Result{}, nil
}

// syncSecret creates or updates the Secret with the API key
func (r *NexusGateAppReconciler) syncSecret(ctx context.Context, app *gatewayv1alpha1.NexusGateApp, apiKey string) error {
	log := logf.FromContext(ctx)

	// Determine the secret namespace
	secretNamespace := app.Spec.SecretRef.Namespace
	if secretNamespace == "" {
		secretNamespace = app.Namespace
	}

	// Determine the secret key
	secretKey := app.Spec.SecretRef.Key
	if secretKey == "" {
		secretKey = "NEXUSGATE_API_KEY"
	}

	secretName := types.NamespacedName{
		Name:      app.Spec.SecretRef.Name,
		Namespace: secretNamespace,
	}

	// Try to get existing secret
	var existingSecret corev1.Secret
	err := r.Get(ctx, secretName, &existingSecret)
	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("failed to get existing secret: %w", err)
	}

	if errors.IsNotFound(err) {
		// Create new secret
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      app.Spec.SecretRef.Name,
				Namespace: secretNamespace,
				Labels: map[string]string{
					"app.kubernetes.io/managed-by": "nexusgate-operator",
					"nexusgate.io/app-name":        app.Spec.AppName,
				},
			},
			Type: corev1.SecretTypeOpaque,
			StringData: map[string]string{
				secretKey: apiKey,
			},
		}

		// Set owner reference only if the secret is in the same namespace
		if secretNamespace == app.Namespace {
			if err := controllerutil.SetControllerReference(app, secret, r.Scheme); err != nil {
				return fmt.Errorf("failed to set controller reference: %w", err)
			}
		}

		if err := r.Create(ctx, secret); err != nil {
			return fmt.Errorf("failed to create secret: %w", err)
		}
		log.Info("secret created", "name", secretName.Name, "namespace", secretName.Namespace)
	} else {
		// Update existing secret
		if existingSecret.Data == nil {
			existingSecret.Data = make(map[string][]byte)
		}
		existingSecret.Data[secretKey] = []byte(apiKey)

		// Ensure labels are set
		if existingSecret.Labels == nil {
			existingSecret.Labels = make(map[string]string)
		}
		existingSecret.Labels["app.kubernetes.io/managed-by"] = "nexusgate-operator"
		existingSecret.Labels["nexusgate.io/app-name"] = app.Spec.AppName

		if err := r.Update(ctx, &existingSecret); err != nil {
			return fmt.Errorf("failed to update secret: %w", err)
		}
		log.Info("secret updated", "name", secretName.Name, "namespace", secretName.Namespace)
	}

	return nil
}

// updateStatusError updates the status to Error state
func (r *NexusGateAppReconciler) updateStatusError(ctx context.Context, app *gatewayv1alpha1.NexusGateApp, message string) (ctrl.Result, error) {
	app.Status.Phase = gatewayv1alpha1.PhaseError
	app.Status.Message = message
	app.Status.SecretSynced = false

	if err := r.Status().Update(ctx, app); err != nil {
		return ctrl.Result{}, err
	}

	// Requeue with backoff for retry
	return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}

// buildExternalID builds the external ID for the API key
func (r *NexusGateAppReconciler) buildExternalID(app *gatewayv1alpha1.NexusGateApp) string {
	return fmt.Sprintf("k8s/%s/%s/%s", r.ClusterName, app.Namespace, app.Spec.AppName)
}

// maskAPIKey returns a masked version of the API key for display
func maskAPIKey(key string) string {
	if len(key) <= 8 {
		return "***"
	}
	return key[:7] + "..." + key[len(key)-4:]
}

// SetupWithManager sets up the controller with the Manager.
func (r *NexusGateAppReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gatewayv1alpha1.NexusGateApp{}).
		Owns(&corev1.Secret{}).
		Named("nexusgateapp").
		Complete(r)
}
