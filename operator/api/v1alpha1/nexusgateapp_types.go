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

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// DeletionPolicy defines what happens to the API key when the NexusGateApp is deleted
// +kubebuilder:validation:Enum=Revoke;Retain
type DeletionPolicy string

const (
	// DeletionPolicyRevoke revokes the API key when the NexusGateApp is deleted
	DeletionPolicyRevoke DeletionPolicy = "Revoke"
	// DeletionPolicyRetain keeps the API key when the NexusGateApp is deleted
	DeletionPolicyRetain DeletionPolicy = "Retain"
)

// SecretRef defines the reference to the Secret where the API key will be stored
type SecretRef struct {
	// Name is the name of the Secret
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`

	// Namespace is the namespace of the Secret (defaults to the NexusGateApp's namespace)
	// +optional
	Namespace string `json:"namespace,omitempty"`

	// Key is the key in the Secret data where the API key will be stored
	// +kubebuilder:default="NEXUSGATE_API_KEY"
	// +optional
	Key string `json:"key,omitempty"`
}

// NexusGateAppSpec defines the desired state of NexusGateApp
type NexusGateAppSpec struct {
	// AppName is the application name used as identifier in NexusGate
	// This will be stored in the API key's externalId field as k8s/{cluster}/{namespace}/{appName}
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:MaxLength=63
	// +kubebuilder:validation:Pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`
	AppName string `json:"appName"`

	// SecretRef defines where to store the API key
	// +kubebuilder:validation:Required
	SecretRef SecretRef `json:"secretRef"`

	// DeletionPolicy defines what happens to the API key when this resource is deleted
	// +kubebuilder:default=Revoke
	// +optional
	DeletionPolicy DeletionPolicy `json:"deletionPolicy,omitempty"`
}

// NexusGateAppPhase defines the current phase of the NexusGateApp
// +kubebuilder:validation:Enum=Pending;Ready;Error;Deleting
type NexusGateAppPhase string

const (
	// PhasePending indicates the resource is being processed
	PhasePending NexusGateAppPhase = "Pending"
	// PhaseReady indicates the API key is provisioned and synced
	PhaseReady NexusGateAppPhase = "Ready"
	// PhaseError indicates an error occurred
	PhaseError NexusGateAppPhase = "Error"
	// PhaseDeleting indicates the resource is being deleted
	PhaseDeleting NexusGateAppPhase = "Deleting"
)

// NexusGateAppStatus defines the observed state of NexusGateApp
type NexusGateAppStatus struct {
	// Phase indicates the current phase of the NexusGateApp
	// +optional
	Phase NexusGateAppPhase `json:"phase,omitempty"`

	// APIKeyID is the ID of the API key in NexusGate database
	// +optional
	APIKeyID int `json:"apiKeyId,omitempty"`

	// APIKeyPrefix is the masked prefix of the API key (e.g., sk-xxxx...xxxx)
	// +optional
	APIKeyPrefix string `json:"apiKeyPrefix,omitempty"`

	// SecretSynced indicates whether the Secret has been successfully synced
	// +optional
	SecretSynced bool `json:"secretSynced,omitempty"`

	// LastSyncTime is the last time the resource was successfully synced
	// +optional
	LastSyncTime *metav1.Time `json:"lastSyncTime,omitempty"`

	// Message provides human-readable status information
	// +optional
	Message string `json:"message,omitempty"`

	// Conditions represent the current state of the NexusGateApp resource
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="App",type=string,JSONPath=`.spec.appName`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Secret",type=string,JSONPath=`.spec.secretRef.name`
// +kubebuilder:printcolumn:name="Synced",type=boolean,JSONPath=`.status.secretSynced`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// NexusGateApp is the Schema for the nexusgateapps API
type NexusGateApp struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitzero"`

	// spec defines the desired state of NexusGateApp
	// +required
	Spec NexusGateAppSpec `json:"spec"`

	// status defines the observed state of NexusGateApp
	// +optional
	Status NexusGateAppStatus `json:"status,omitzero"`
}

// +kubebuilder:object:root=true

// NexusGateAppList contains a list of NexusGateApp
type NexusGateAppList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitzero"`
	Items           []NexusGateApp `json:"items"`
}

func init() {
	SchemeBuilder.Register(&NexusGateApp{}, &NexusGateAppList{})
}
