// Package storage wraps the Supabase Storage REST API.
//
// Audio files never pass through this server. Vercel caps a serverless request
// body at 4.5MB and a full-length MP3 routinely exceeds that, so the browser
// uploads straight to Supabase using a short-lived signed URL minted here. The
// service key stays server-side and the bucket stays private — playback also
// goes through a signed, expiring URL.
package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	key     string
	bucket  string
	http    *http.Client
}

func New(baseURL, key, bucket string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		key:     key,
		bucket:  bucket,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// Configured reports whether the storage env vars were supplied. Handlers use
// this to return a clear "not set up" error instead of a confusing 500.
func (c *Client) Configured() bool {
	return c != nil && c.baseURL != "" && c.key != "" && c.bucket != ""
}

func (c *Client) do(method, path string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, c.baseURL+"/storage/v1"+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("apikey", c.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.http.Do(req)
}

func drain(res *http.Response) string {
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
	return strings.TrimSpace(string(b))
}

// SignedUploadURL returns a one-shot URL the browser can PUT the file to.
// Supabase tokens for this endpoint are valid for two hours.
func (c *Client) SignedUploadURL(path string) (string, error) {
	res, err := c.do(http.MethodPost, "/object/upload/sign/"+c.bucket+"/"+path, nil)
	if err != nil {
		return "", err
	}
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("supabase sign upload: %s: %s", res.Status, drain(res))
	}

	var out struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		res.Body.Close()
		return "", err
	}
	res.Body.Close()

	// The response gives a path relative to /storage/v1, already carrying the
	// signing token as a query param.
	return c.baseURL + "/storage/v1/" + strings.TrimPrefix(out.URL, "/"), nil
}

// SignedDownloadURL returns a playback URL valid for expiresIn seconds. Kept
// short — long enough for a rehearsal, not long enough to be a public link.
func (c *Client) SignedDownloadURL(path string, expiresIn int) (string, error) {
	payload, _ := json.Marshal(map[string]int{"expiresIn": expiresIn})
	res, err := c.do(http.MethodPost, "/object/sign/"+c.bucket+"/"+path, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("supabase sign download: %s: %s", res.Status, drain(res))
	}

	var out struct {
		SignedURL string `json:"signedURL"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		res.Body.Close()
		return "", err
	}
	res.Body.Close()

	return c.baseURL + "/storage/v1/" + strings.TrimPrefix(out.SignedURL, "/"), nil
}

// Remove deletes an object. A 404 is treated as success so a row whose file
// already vanished can still be cleaned up.
func (c *Client) Remove(path string) error {
	res, err := c.do(http.MethodDelete, "/object/"+c.bucket+"/"+path, nil)
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 && res.StatusCode != http.StatusNotFound {
		return fmt.Errorf("supabase delete: %s: %s", res.Status, drain(res))
	}
	res.Body.Close()
	return nil
}

// Stat confirms an object actually landed, so we never record a row for an
// upload the browser claimed but never completed.
func (c *Client) Stat(path string) (int64, error) {
	req, err := http.NewRequest(http.MethodHead, c.baseURL+"/storage/v1/object/authenticated/"+c.bucket+"/"+path, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("apikey", c.key)

	res, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return 0, fmt.Errorf("supabase stat: %s", res.Status)
	}
	return res.ContentLength, nil
}
