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

package nexusgate

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Client is a NexusGate Admin API client
type Client struct {
	baseURL    string
	adminToken string
	httpClient *http.Client
}

// APIKeyResponse represents the response from the API key endpoints
type APIKeyResponse struct {
	Key        string  `json:"key"`
	ID         int     `json:"id"`
	Created    bool    `json:"created"`
	ExternalID *string `json:"externalId"`
	Revoked    bool    `json:"revoked"`
}

// EnsureAPIKeyRequest represents the request body for ensuring an API key
type EnsureAPIKeyRequest struct {
	Comment  string `json:"comment,omitempty"`
	RpmLimit int    `json:"rpmLimit,omitempty"`
	TpmLimit int    `json:"tpmLimit,omitempty"`
}

// NewClient creates a new NexusGate Admin API client
func NewClient(baseURL, adminToken string) *Client {
	return &Client{
		baseURL:    baseURL,
		adminToken: adminToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// EnsureAPIKey ensures an API key exists for the given external ID (idempotent)
// If the key doesn't exist, it creates one. If it exists, it returns the existing key.
func (c *Client) EnsureAPIKey(ctx context.Context, externalID, comment string) (*APIKeyResponse, error) {
	endpoint := fmt.Sprintf("%s/admin/apiKey/by-external-id/%s", c.baseURL, url.PathEscape(externalID))

	reqBody := EnsureAPIKeyRequest{
		Comment: comment,
	}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.adminToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error: status %d, body: %s", resp.StatusCode, string(body))
	}

	var result APIKeyResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetAPIKeyByExternalID retrieves an API key by its external ID
func (c *Client) GetAPIKeyByExternalID(ctx context.Context, externalID string) (*APIKeyResponse, error) {
	endpoint := fmt.Sprintf("%s/admin/apiKey/by-external-id/%s", c.baseURL, url.PathEscape(externalID))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil // Key not found
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error: status %d, body: %s", resp.StatusCode, string(body))
	}

	var result APIKeyResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// RevokeAPIKey revokes an API key by its key value
func (c *Client) RevokeAPIKey(ctx context.Context, key string) error {
	endpoint := fmt.Sprintf("%s/admin/apiKey/%s", c.baseURL, url.PathEscape(key))

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// Key already doesn't exist, consider it as success
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// HealthCheck performs a health check against the NexusGate API
func (c *Client) HealthCheck(ctx context.Context) error {
	endpoint := fmt.Sprintf("%s/admin/apiKey", c.baseURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}

	return nil
}
