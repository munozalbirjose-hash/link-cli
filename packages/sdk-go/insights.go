package link

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// InsightsResource provides insight operations.
type InsightsResource struct {
	base *baseResource
}

// ListAvailableTypes returns a page of insight types available to the user.
func (r *InsightsResource) ListAvailableTypes(ctx context.Context, params *ListAvailableInsightTypesParams) (*AvailableInsightTypesPage, error) {
	query := url.Values{}
	if params != nil {
		setInsightsPagination(query, params.Limit, params.StartingAfter)
	}
	var result AvailableInsightTypesPage
	if err := r.list(ctx, "list available insight types", "/insights/available_types", query, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// List returns a page of insight results.
func (r *InsightsResource) List(ctx context.Context, params *ListInsightsParams) (*InsightsPage, error) {
	query := url.Values{}
	if params != nil {
		setInsightsPagination(query, params.Limit, params.StartingAfter)
		for _, insight := range params.Insights {
			query.Add("insights[]", insight)
		}
	}
	var result InsightsPage
	if err := r.list(ctx, "list insights", "/insights", query, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *InsightsResource) list(ctx context.Context, operation, path string, query url.Values, target any) error {
	endpoint, err := url.Parse(r.base.baseURL + path)
	if err != nil {
		return newConfigurationError("Invalid insights URL: " + err.Error())
	}
	endpoint.RawQuery = query.Encode()
	return r.base.doJSON(ctx, operation, http.MethodGet, endpoint.String(), nil, target)
}

func setInsightsPagination(query url.Values, limit *int64, startingAfter *string) {
	if limit != nil {
		query.Set("limit", strconv.FormatInt(*limit, 10))
	}
	if startingAfter != nil {
		query.Set("starting_after", *startingAfter)
	}
}
