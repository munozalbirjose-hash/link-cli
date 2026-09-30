package link

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

const updatedShippingAddress = `{"id":"addr_1","is_default":false,"nickname":null,"address":{"line_2":"","country_code":"US"}}`

func TestUpdateShippingAddress(t *testing.T) {
	empty, city, name, country, street, state, postal := "", "Boston", " Jane Doe ", "US", "123 Main St", "MA", "02110"
	yes, no := true, false
	for _, test := range []struct {
		name   string
		params UpdateShippingAddressParams
		body   string
	}{
		{"all fields", UpdateShippingAddressParams{Address: &EditableShippingAddress{Name: &name, CountryCode: &country, Line1: &street, Line2: &empty, Locality: &city, AdministrativeArea: &state, PostalCode: &postal}}, `{"address":{"name":" Jane Doe ","country_code":"US","line_1":"123 Main St","line_2":"","locality":"Boston","administrative_area":"MA","postal_code":"02110"}}`},
		{"clear", UpdateShippingAddressParams{Address: &EditableShippingAddress{Line2: &empty}}, `{"address":{"line_2":""}}`},
		{"preserve omitted", UpdateShippingAddressParams{Address: &EditableShippingAddress{Locality: &city}}, `{"address":{"locality":"Boston"}}`},
		{"set default", UpdateShippingAddressParams{IsDefault: &yes}, `{"is_default":true}`},
		{"unset default", UpdateShippingAddressParams{IsDefault: &no}, `{"is_default":false}`},
		{"empty address", UpdateShippingAddressParams{Address: &EditableShippingAddress{}, IsDefault: &no}, `{"is_default":false}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.Method != http.MethodPost || r.RequestURI != "/shipping_addresses/addr%2F..%2Fother" {
					t.Errorf("unexpected request: %s %s", r.Method, r.RequestURI)
				}
				if r.Header.Get("Authorization") != "Bearer token" || r.Header.Get("Content-Type") != "application/json" {
					t.Errorf("unexpected headers: %v", r.Header)
				}
				var actual, expected map[string]any
				if err := json.NewDecoder(r.Body).Decode(&actual); err != nil {
					t.Error(err)
				}
				if err := json.Unmarshal([]byte(test.body), &expected); err != nil {
					t.Error(err)
				}
				if !reflect.DeepEqual(actual, expected) {
					t.Errorf("got %#v, want %#v", actual, expected)
				}
				_, _ = w.Write([]byte(updatedShippingAddress))
			}))
			defer server.Close()
			client, _ := NewClient(Options{AccessToken: "token", APIBaseURL: server.URL})
			result, err := client.ShippingAddresses.Update(context.Background(), "addr/../other", test.params)
			if err != nil {
				t.Fatal(err)
			}
			if requests != 1 || result.ID != "addr_1" || result.IsDefault || result.Address == nil || result.Address.Line2 == nil || *result.Address.Line2 != "" {
				t.Fatalf("unexpected result: %#v (%d requests)", result, requests)
			}
		})
	}
}

func TestUpdateShippingAddressRejectsEmptyInput(t *testing.T) {
	client, _ := NewClient(Options{AccessToken: "token", APIBaseURL: "http://127.0.0.1:1"})
	for _, params := range []UpdateShippingAddressParams{{}, {Address: &EditableShippingAddress{}}} {
		_, err := client.ShippingAddresses.Update(context.Background(), "addr_1", params)
		var sdkError *LinkSDKError
		if !errors.As(err, &sdkError) || sdkError.Message != "Provide at least one address field or default status" {
			t.Fatalf("got %v", err)
		}
	}
}

func TestUpdateShippingAddressErrors(t *testing.T) {
	for _, status := range []int{400, 403, 404, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":{"message":"Update unavailable"}}`))
			}))
			defer server.Close()
			client, _ := NewClient(Options{AccessToken: "token", APIBaseURL: server.URL})
			value := false
			_, err := client.ShippingAddresses.Update(context.Background(), "addr_1", UpdateShippingAddressParams{IsDefault: &value})
			var apiError *LinkAPIError
			if !errors.As(err, &apiError) || apiError.Status != status {
				t.Fatalf("got %v", err)
			}
		})
	}
	for _, body := range []string{`{"id":123}`, `{"address":{"line_2":42}}`, `null`, `not JSON`} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
			defer server.Close()
			client, _ := NewClient(Options{AccessToken: "token", APIBaseURL: server.URL})
			value := false
			_, err := client.ShippingAddresses.Update(context.Background(), "addr_1", UpdateShippingAddressParams{IsDefault: &value})
			var responseError *LinkResponseError
			if !errors.As(err, &responseError) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestUpdateShippingAddressRefresh(t *testing.T) {
	requests, providerCalls := 0, 0
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		bodies = append(bodies, body)
		if requests == 1 {
			w.WriteHeader(401)
			return
		}
		if r.Header.Get("Authorization") != "Bearer new" {
			t.Error("expected refreshed token")
		}
		_, _ = w.Write([]byte(updatedShippingAddress))
	}))
	defer server.Close()
	client, _ := NewClient(Options{APIBaseURL: server.URL, GetAccessToken: func(_ context.Context, options GetAccessTokenOptions) (string, error) {
		providerCalls++
		if options.ForceRefresh {
			return "new", nil
		}
		return "old", nil
	}})
	empty, no := "", false
	_, err := client.ShippingAddresses.Update(context.Background(), "addr_1", UpdateShippingAddressParams{Address: &EditableShippingAddress{Line2: &empty}, IsDefault: &no})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || providerCalls != 2 || !reflect.DeepEqual(bodies[0], bodies[1]) {
		t.Fatalf("requests=%d providerCalls=%d bodies=%v", requests, providerCalls, bodies)
	}
}
