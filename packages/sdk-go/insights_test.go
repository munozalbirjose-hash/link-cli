package link

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
)

const readyInsightsResponse = `{"data":[{"status":"ready","as_of":1790723779,"id":"top_brand_by_transaction_count_per_category_t180d","description":"Top brands from shopping categories in the last 180 days based on transaction count","data":[{"label":"Top brand from Clothing and accessories shopping category","value":{"type":"number_of_items","number_of_items":{"label":"J.crew","count":10}}},{"label":"Top brand from Department stores shopping category","value":{"type":"number_of_items","number_of_items":{"label":"Nordstrom","count":5}}}]}],"has_more":false}`

type capturedRequest struct {
	path  string
	query map[string][]string
	auth  string
}

func newInsightsTestClient(t *testing.T, status int, body string) (*Client, *[]capturedRequest) {
	t.Helper()
	var requests []capturedRequest
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests = append(requests, capturedRequest{
			path:  request.URL.Path,
			query: request.URL.Query(),
			auth:  request.Header.Get("Authorization"),
		})
		response.WriteHeader(status)
		_, _ = response.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	client, err := NewClient(Options{AccessToken: "token", APIBaseURL: server.URL + "/prefix"})
	assertNoError(t, err)
	return client, &requests
}

func TestInsightsListAvailableTypesEncodesQuery(t *testing.T) {
	limit := int64(5)
	startingAfter := "insight_a/b ?"
	tests := []struct {
		name   string
		params *ListAvailableInsightTypesParams
		query  map[string][]string
	}{
		{name: "nil", params: nil, query: map[string][]string{}},
		{name: "empty", params: &ListAvailableInsightTypesParams{}, query: map[string][]string{}},
		{
			name:   "pagination",
			params: &ListAvailableInsightTypesParams{Limit: &limit, StartingAfter: &startingAfter},
			query:  map[string][]string{"limit": {"5"}, "starting_after": {startingAfter}},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client, requests := newInsightsTestClient(t, http.StatusOK, `{"data":[],"has_more":false}`)
			page, err := client.Insights.ListAvailableTypes(context.Background(), test.params)
			assertNoError(t, err)
			if len(page.Data) != 0 || page.HasMore {
				t.Fatalf("unexpected page: %#v", page)
			}
			request := (*requests)[0]
			if request.path != "/prefix/insights/available_types" {
				t.Fatalf("got path %q", request.path)
			}
			if !reflect.DeepEqual(request.query, test.query) {
				t.Fatalf("got query %#v, want %#v", request.query, test.query)
			}
			if request.auth != "Bearer token" {
				t.Fatalf("got authorization %q", request.auth)
			}
		})
	}
}

func TestInsightsListEncodesQuery(t *testing.T) {
	limit := int64(100)
	startingAfter := "insight_1"
	tests := []struct {
		name   string
		params *ListInsightsParams
		query  map[string][]string
	}{
		{name: "nil", params: nil, query: map[string][]string{}},
		{name: "empty insights", params: &ListInsightsParams{Insights: []string{}}, query: map[string][]string{}},
		{
			name: "all",
			params: &ListInsightsParams{
				Insights:      []string{"second", "first", "a/b"},
				Limit:         &limit,
				StartingAfter: &startingAfter,
			},
			query: map[string][]string{
				"insights[]":     {"second", "first", "a/b"},
				"limit":          {"100"},
				"starting_after": {"insight_1"},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client, requests := newInsightsTestClient(t, http.StatusOK, `{"data":[],"has_more":true}`)
			page, err := client.Insights.List(context.Background(), test.params)
			assertNoError(t, err)
			if !page.HasMore {
				t.Fatalf("got has_more false")
			}
			request := (*requests)[0]
			if request.path != "/prefix/insights" {
				t.Fatalf("got path %q", request.path)
			}
			if !reflect.DeepEqual(request.query, test.query) {
				t.Fatalf("got query %#v, want %#v", request.query, test.query)
			}
		})
	}
}

func TestInsightsListDecodesReadyResult(t *testing.T) {
	client, _ := newInsightsTestClient(t, http.StatusOK, readyInsightsResponse)
	page, err := client.Insights.List(context.Background(), nil)
	assertNoError(t, err)
	if page.HasMore || len(page.Data) != 1 {
		t.Fatalf("unexpected page: %#v", page)
	}
	insight := page.Data[0]
	if insight.Status != InsightStatusReady || insight.ID != "top_brand_by_transaction_count_per_category_t180d" {
		t.Fatalf("unexpected insight: %#v", insight)
	}
	if insight.AsOf == nil || *insight.AsOf != 1790723779 || insight.ErrorCode != nil || insight.AuthorizationRemediation != nil {
		t.Fatalf("unexpected insight metadata: %#v", insight)
	}
	if len(insight.Data) != 2 || insight.Data[0].Label != "Top brand from Clothing and accessories shopping category" {
		t.Fatalf("unexpected entries: %#v", insight.Data)
	}
	value := insight.Data[0].Value
	if value.Type != InsightValueTypeNumberOfItems || value.NumberOfItems == nil || value.NumberOfItems.Count != 10 || value.NumberOfItems.Label == nil || *value.NumberOfItems.Label != "J.crew" || value.AdditionalFields != nil {
		t.Fatalf("unexpected value: %#v", value)
	}
	assertJSONRoundTrip(t, readyInsightsResponse, page)
}

func TestInsightsListDecodesNonReadyResults(t *testing.T) {
	body := `{"data":[
		{"status":"pending","id":"pending_insight","description":"Pending"},
		{"status":"no_data","id":"missing_permissions","description":"Needs access","as_of":1,"data":null,
		 "error_code":"missing_permissions","error_message":"Grant access to transactions.",
		 "authorization_remediation":{"authorization_details":[{"type":"source","actions":["read_link_transactions","read_external_transactions"]}]}},
		{"status":"no_data","id":"internal","description":"Failed","as_of":2,"error_code":"internal_error","error_message":null,"authorization_remediation":null},
		{"status":"no_data","id":"empty","description":"Nothing yet","as_of":3,"data":[]}
	],"has_more":false}`
	client, _ := newInsightsTestClient(t, http.StatusOK, body)
	page, err := client.Insights.List(context.Background(), nil)
	assertNoError(t, err)
	if len(page.Data) != 4 {
		t.Fatalf("got %d insights", len(page.Data))
	}

	pending := page.Data[0]
	if pending.Status != InsightStatusPending || pending.AsOf != nil || pending.Data != nil {
		t.Fatalf("unexpected pending insight: %#v", pending)
	}

	missing := page.Data[1]
	if missing.Status != InsightStatusNoData || missing.ErrorCode == nil || *missing.ErrorCode != InsightErrorCodeMissingPermissions {
		t.Fatalf("unexpected missing-permissions insight: %#v", missing)
	}
	if missing.ErrorMessage == nil || *missing.ErrorMessage != "Grant access to transactions." || missing.Data != nil {
		t.Fatalf("unexpected missing-permissions details: %#v", missing)
	}
	wantDetails := []AuthorizationDetail{{Type: "source", Actions: []string{"read_link_transactions", "read_external_transactions"}}}
	if missing.AuthorizationRemediation == nil || !reflect.DeepEqual(missing.AuthorizationRemediation.AuthorizationDetails, wantDetails) {
		t.Fatalf("unexpected remediation: %#v", missing.AuthorizationRemediation)
	}

	internal := page.Data[2]
	if internal.ErrorCode == nil || *internal.ErrorCode != InsightErrorCodeInternalError || internal.ErrorMessage != nil || internal.AuthorizationRemediation != nil {
		t.Fatalf("unexpected internal-error insight: %#v", internal)
	}

	empty := page.Data[3]
	if empty.ErrorCode != nil || empty.Data == nil || len(empty.Data) != 0 || empty.AsOf == nil || *empty.AsOf != 3 {
		t.Fatalf("unexpected empty insight: %#v", empty)
	}
	encoded, err := json.Marshal(empty)
	assertNoError(t, err)
	var fields map[string]json.RawMessage
	assertNoError(t, json.Unmarshal(encoded, &fields))
	if string(fields["data"]) != "[]" {
		t.Fatalf("explicit empty data was not preserved: %s", encoded)
	}
}

func TestInsightsPreserveUnknownValuesAndFields(t *testing.T) {
	body := `{"data":[{"status":"stale","id":"future","description":"Future","error_code":"rate_limited","future_field":{"nested":true},
		"authorization_remediation":{"scope":["transactions:read"],"authorization_details":[{"type":"source","actions":[],"locations":["https://api.link.com"]}],"hint":"reauthorize"},
		"data":[{"label":"Volume","value":{"type":"payment_volume","payment_volume":{"amount":1200,"currency":"usd"}},"rank":1},
		        {"label":"Count","value":{"type":"number_of_items","number_of_items":{"count":2,"unit":"brands"},"extra":"kept"}},
		        {"label":"Legacy","value":{"type":"text","number_of_items":"not validated for unknown types"}}]}],
		"has_more":false,"next_cursor":"opaque"}`
	client, _ := newInsightsTestClient(t, http.StatusOK, body)
	page, err := client.Insights.List(context.Background(), nil)
	assertNoError(t, err)
	if page.AdditionalFields["next_cursor"] != "opaque" {
		t.Fatalf("page extras lost: %#v", page.AdditionalFields)
	}
	insight := page.Data[0]
	if insight.Status != "stale" || insight.ErrorCode == nil || *insight.ErrorCode != "rate_limited" {
		t.Fatalf("unknown enum values lost: %#v", insight)
	}
	if !reflect.DeepEqual(insight.AdditionalFields, map[string]any{"future_field": map[string]any{"nested": true}}) {
		t.Fatalf("insight extras lost: %#v", insight.AdditionalFields)
	}
	remediation := insight.AuthorizationRemediation
	if remediation.AdditionalFields["hint"] != "reauthorize" || remediation.AuthorizationDetails[0].AdditionalFields["locations"] == nil {
		t.Fatalf("remediation extras lost: %#v", remediation)
	}

	unknown := insight.Data[0]
	if unknown.Value.Type != "payment_volume" || unknown.Value.NumberOfItems != nil || unknown.AdditionalFields["rank"] != float64(1) {
		t.Fatalf("unexpected unknown value entry: %#v", unknown)
	}
	wantVolume := map[string]any{"payment_volume": map[string]any{"amount": float64(1200), "currency": "usd"}}
	if !reflect.DeepEqual(unknown.Value.AdditionalFields, wantVolume) {
		t.Fatalf("unknown value fields lost: %#v", unknown.Value.AdditionalFields)
	}
	known := insight.Data[1].Value
	if known.NumberOfItems.Count != 2 || known.NumberOfItems.AdditionalFields["unit"] != "brands" || known.AdditionalFields["extra"] != "kept" {
		t.Fatalf("known value extras lost: %#v", known)
	}
	if text := insight.Data[2].Value; text.NumberOfItems != nil || text.AdditionalFields["number_of_items"] != "not validated for unknown types" {
		t.Fatalf("unknown value type was validated as number_of_items: %#v", text)
	}
	assertJSONRoundTrip(t, body, page)
}

func TestInsightsListAvailableTypesDecodesRemediationAndExtras(t *testing.T) {
	body := `{"data":[
		{"id":"ready_type","description":"Ready","authorization_remediation":null},
		{"id":"needs_access","description":"Needs access","category":"shopping",
		 "authorization_remediation":{"scope":[],"authorization_details":[{"type":"source","actions":["read_link_transactions","read_external_transactions"]}]}}
	],"has_more":true,"url":"/insights/available_types"}`
	client, _ := newInsightsTestClient(t, http.StatusOK, body)
	page, err := client.Insights.ListAvailableTypes(context.Background(), nil)
	assertNoError(t, err)
	if !page.HasMore || page.AdditionalFields["url"] != "/insights/available_types" || len(page.Data) != 2 {
		t.Fatalf("unexpected page: %#v", page)
	}
	if page.Data[0].AuthorizationRemediation != nil {
		t.Fatalf("null remediation was not treated as absent: %#v", page.Data[0])
	}
	needsAccess := page.Data[1]
	if needsAccess.AdditionalFields["category"] != "shopping" || needsAccess.AuthorizationRemediation.Scope == nil {
		t.Fatalf("unexpected insight type: %#v", needsAccess)
	}
	if actions := needsAccess.AuthorizationRemediation.AuthorizationDetails[0].Actions; !reflect.DeepEqual(actions, []string{"read_link_transactions", "read_external_transactions"}) {
		t.Fatalf("got actions %#v", actions)
	}
}

func TestInsightsRejectInvalidResponses(t *testing.T) {
	tests := []struct {
		name      string
		available bool
		body      string
	}{
		{name: "types missing has_more", available: true, body: `{"data":[]}`},
		{name: "types missing data", available: true, body: `{"has_more":false}`},
		{name: "type missing id", available: true, body: `{"data":[{"description":"Missing ID"}],"has_more":false}`},
		{name: "type null description", available: true, body: `{"data":[{"id":"a","description":null}],"has_more":false}`},
		{name: "detail missing type", available: true, body: `{"data":[{"id":"a","description":"A","authorization_remediation":{"authorization_details":[{"actions":[]}]}}],"has_more":false}`},
		{name: "insights missing has_more", body: `{"data":[]}`},
		{name: "insights null data", body: `{"data":null,"has_more":false}`},
		{name: "has_more wrong type", body: `{"data":[],"has_more":"false"}`},
		{name: "insight missing id", body: `{"data":[{"status":"ready","description":"A"}],"has_more":false}`},
		{name: "insight missing status", body: `{"data":[{"id":"a","description":"A"}],"has_more":false}`},
		{name: "entry missing value", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L"}]}],"has_more":false}`},
		{name: "value missing type", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L","value":{}}]}],"has_more":false}`},
		{name: "number_of_items missing payload", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L","value":{"type":"number_of_items"}}]}],"has_more":false}`},
		{name: "number_of_items missing count", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L","value":{"type":"number_of_items","number_of_items":{}}}]}],"has_more":false}`},
		{name: "number_of_items numeric label", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L","value":{"type":"number_of_items","number_of_items":{"label":7,"count":4}}}]}],"has_more":false}`},
		{name: "number_of_items string count", body: `{"data":[{"status":"ready","id":"a","description":"A","data":[{"label":"L","value":{"type":"number_of_items","number_of_items":{"count":"4"}}}]}],"has_more":false}`},
		{name: "null body", body: `null`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client, _ := newInsightsTestClient(t, http.StatusOK, test.body)
			var err error
			if test.available {
				_, err = client.Insights.ListAvailableTypes(context.Background(), nil)
			} else {
				_, err = client.Insights.List(context.Background(), nil)
			}
			var responseError *LinkResponseError
			if !errors.As(err, &responseError) || responseError.Code != "invalid_response" {
				t.Fatalf("got %v, want LinkResponseError", err)
			}
		})
	}
}

func TestInsightsReturnTypedAPIErrors(t *testing.T) {
	client, _ := newInsightsTestClient(t, http.StatusInternalServerError, `{"error":{"message":"insights unavailable"}}`)
	for name, call := range map[string]func() error{
		"list available types": func() error {
			_, err := client.Insights.ListAvailableTypes(context.Background(), nil)
			return err
		},
		"list": func() error {
			_, err := client.Insights.List(context.Background(), nil)
			return err
		},
	} {
		var apiError *LinkAPIError
		if err := call(); !errors.As(err, &apiError) || apiError.Status != http.StatusInternalServerError {
			t.Fatalf("%s: got %v, want LinkAPIError", name, err)
		}
		if apiError.Error() == "" || apiError.RawBody != `{"error":{"message":"insights unavailable"}}` {
			t.Fatalf("%s: unexpected API error: %#v", name, apiError)
		}
	}
}

func TestInsightsRefreshOnceOnUnauthorized(t *testing.T) {
	var mu sync.Mutex
	var providerCalls []GetAccessTokenOptions
	provider := func(_ context.Context, options GetAccessTokenOptions) (string, error) {
		mu.Lock()
		defer mu.Unlock()
		providerCalls = append(providerCalls, options)
		if options.ForceRefresh {
			return "fresh_token", nil
		}
		return "expired_token", nil
	}
	var requests []capturedRequest
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests = append(requests, capturedRequest{path: request.URL.Path, query: request.URL.Query(), auth: request.Header.Get("Authorization")})
		if request.Header.Get("Authorization") == "Bearer expired_token" {
			response.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = response.Write([]byte(readyInsightsResponse))
	}))
	defer server.Close()

	client, err := NewClient(Options{GetAccessToken: provider, APIBaseURL: server.URL})
	assertNoError(t, err)
	page, err := client.Insights.List(context.Background(), &ListInsightsParams{Insights: []string{"top_brand_by_transaction_count_per_category_t180d"}})
	assertNoError(t, err)
	if len(page.Data) != 1 || len(requests) != 2 {
		t.Fatalf("got %d insights and %d requests", len(page.Data), len(requests))
	}
	if !reflect.DeepEqual(requests[0].query, requests[1].query) || requests[1].auth != "Bearer fresh_token" {
		t.Fatalf("retry differed: %#v", requests)
	}
	if !reflect.DeepEqual(providerCalls, []GetAccessTokenOptions{{}, {ForceRefresh: true}}) {
		t.Fatalf("provider calls differ: %#v", providerCalls)
	}
}

func assertJSONRoundTrip(t *testing.T, want string, value any) {
	t.Helper()
	encoded, err := json.Marshal(value)
	assertNoError(t, err)
	var got, expected any
	assertNoError(t, json.Unmarshal(encoded, &got))
	assertNoError(t, json.Unmarshal([]byte(want), &expected))
	if !reflect.DeepEqual(got, expected) {
		t.Fatalf("round trip differed:\ngot  %s\nwant %s", encoded, want)
	}
}
