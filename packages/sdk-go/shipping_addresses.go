package link

import (
	"context"
	"net/http"
	"net/url"
)

// EditableShippingAddress contains editable address fields. Nil preserves a
// field; a pointer to an empty string requests clearing it.
type EditableShippingAddress struct {
	Name               *string `json:"name,omitempty"`
	CountryCode        *string `json:"country_code,omitempty"`
	Line1              *string `json:"line_1,omitempty"`
	Line2              *string `json:"line_2,omitempty"`
	Locality           *string `json:"locality,omitempty"`
	AdministrativeArea *string `json:"administrative_area,omitempty"`
	PostalCode         *string `json:"postal_code,omitempty"`
}

// UpdateShippingAddressParams updates only supplied fields, including false.
type UpdateShippingAddressParams struct {
	Address   *EditableShippingAddress `json:"address,omitempty"`
	IsDefault *bool                    `json:"is_default,omitempty"`
}

// ShippingAddressesResource provides shipping-address operations.
type ShippingAddressesResource struct {
	base *baseResource
}

// Update changes supplied address fields or default status and returns the updated record.
func (r *ShippingAddressesResource) Update(ctx context.Context, id string, params UpdateShippingAddressParams) (*ShippingAddressRecord, error) {
	if params.Address != nil && *params.Address == (EditableShippingAddress{}) {
		params.Address = nil
	}
	if params.Address == nil && params.IsDefault == nil {
		return nil, newSDKError("Provide at least one address field or default status", nil)
	}
	var result ShippingAddressRecord
	endpoint := r.base.baseURL + "/shipping_addresses/" + url.PathEscape(id)
	if err := r.base.doJSON(ctx, "update shipping address", http.MethodPost, endpoint, params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// List returns shipping addresses saved to the Link account.
func (r *ShippingAddressesResource) List(ctx context.Context) ([]ShippingAddressRecord, error) {
	response, err := r.base.fetch(ctx, http.MethodGet, r.base.baseURL+"/shipping_addresses", nil, nil)
	if err != nil {
		return nil, err
	}
	if response.status < 200 || response.status >= 300 {
		return nil, newAPIError("list shipping addresses", response.status, response.data, response.rawBody)
	}
	var envelope struct {
		ShippingAddresses []ShippingAddressRecord `json:"shipping_addresses"`
	}
	if err := decodeResponse("list shipping addresses", response, &envelope); err != nil {
		return nil, err
	}
	return envelope.ShippingAddresses, nil
}
