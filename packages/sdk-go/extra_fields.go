package link

import (
	"bytes"
	"encoding/json"
	"fmt"
)

func unmarshalExtra(data []byte, target any, knownFields ...string) (map[string]any, error) {
	if err := json.Unmarshal(data, target); err != nil {
		return nil, err
	}
	var fields map[string]any
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	for _, field := range knownFields {
		delete(fields, field)
	}
	if len(fields) == 0 {
		return nil, nil
	}
	return fields, nil
}

// requireFields rejects objects that omit a required property or set it to null.
func requireFields(data []byte, fields ...string) error {
	var present map[string]json.RawMessage
	if err := json.Unmarshal(data, &present); err != nil {
		return err
	}
	for _, field := range fields {
		value, ok := present[field]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fmt.Errorf("missing required field %q", field)
		}
	}
	return nil
}

func marshalExtra(source any, extra map[string]any) ([]byte, error) {
	data, err := json.Marshal(source)
	if err != nil {
		return nil, err
	}
	if len(extra) == 0 {
		return data, nil
	}
	var fields map[string]any
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	for key, value := range extra {
		if _, isKnownField := fields[key]; !isKnownField {
			fields[key] = value
		}
	}
	return json.Marshal(fields)
}

func (page *TransactionsPage) UnmarshalJSON(data []byte) error {
	type wire TransactionsPage
	*page = TransactionsPage{}
	extra, err := unmarshalExtra(data, (*wire)(page), "data", "has_more")
	page.AdditionalFields = extra
	return err
}

func (page TransactionsPage) MarshalJSON() ([]byte, error) {
	type wire TransactionsPage
	return marshalExtra(wire(page), page.AdditionalFields)
}

func (source *Source) UnmarshalJSON(data []byte) error {
	type wire Source
	*source = Source{}
	extra, err := unmarshalExtra(
		data,
		(*wire)(source),
		"id",
		"name",
		"type",
		"capabilities",
		"external_connection",
		"granted_actions",
		"bank_account",
		"card",
	)
	source.AdditionalFields = extra
	return err
}

func (source Source) MarshalJSON() ([]byte, error) {
	type wire Source
	present := make(map[string]any, len(source.AdditionalFields)+1)
	for key, value := range source.AdditionalFields {
		present[key] = value
	}
	if source.GrantedActions != nil {
		present["granted_actions"] = source.GrantedActions
	}
	return marshalExtra(wire(source), present)
}

func (page *SourcesPage) UnmarshalJSON(data []byte) error {
	type wire SourcesPage
	*page = SourcesPage{}
	extra, err := unmarshalExtra(data, (*wire)(page), "data", "has_more")
	page.AdditionalFields = extra
	return err
}

func (page SourcesPage) MarshalJSON() ([]byte, error) {
	type wire SourcesPage
	return marshalExtra(wire(page), page.AdditionalFields)
}

func (balance *Balance) UnmarshalJSON(data []byte) error {
	type wire Balance
	*balance = Balance{}
	extra, err := unmarshalExtra(
		data,
		(*wire)(balance),
		"source_id",
		"type",
		"cash",
		"credit",
		"current",
		"currency",
		"as_of",
	)
	balance.AdditionalFields = extra
	return err
}

func (balance Balance) MarshalJSON() ([]byte, error) {
	type wire Balance
	return marshalExtra(wire(balance), balance.AdditionalFields)
}

func (page *BalancesPage) UnmarshalJSON(data []byte) error {
	type wire BalancesPage
	*page = BalancesPage{}
	extra, err := unmarshalExtra(data, (*wire)(page), "data", "has_more")
	page.AdditionalFields = extra
	return err
}

func (page BalancesPage) MarshalJSON() ([]byte, error) {
	type wire BalancesPage
	return marshalExtra(wire(page), page.AdditionalFields)
}

func (detail *AuthorizationDetail) UnmarshalJSON(data []byte) error {
	type wire AuthorizationDetail
	*detail = AuthorizationDetail{}
	if err := requireFields(data, "type"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(detail), "type", "actions")
	detail.AdditionalFields = extra
	return err
}

func (detail AuthorizationDetail) MarshalJSON() ([]byte, error) {
	type wire AuthorizationDetail
	present := make(map[string]any, len(detail.AdditionalFields)+1)
	for key, value := range detail.AdditionalFields {
		present[key] = value
	}
	if detail.Actions != nil {
		present["actions"] = detail.Actions
	}
	return marshalExtra(wire(detail), present)
}

func (remediation *AuthorizationRemediation) UnmarshalJSON(data []byte) error {
	type wire AuthorizationRemediation
	*remediation = AuthorizationRemediation{}
	extra, err := unmarshalExtra(data, (*wire)(remediation), "scope", "authorization_details")
	remediation.AdditionalFields = extra
	return err
}

func (remediation AuthorizationRemediation) MarshalJSON() ([]byte, error) {
	type wire AuthorizationRemediation
	present := make(map[string]any, len(remediation.AdditionalFields)+2)
	for key, value := range remediation.AdditionalFields {
		present[key] = value
	}
	if remediation.Scope != nil {
		present["scope"] = remediation.Scope
	}
	if remediation.AuthorizationDetails != nil {
		present["authorization_details"] = remediation.AuthorizationDetails
	}
	return marshalExtra(wire(remediation), present)
}

func (insightType *AvailableInsightType) UnmarshalJSON(data []byte) error {
	type wire AvailableInsightType
	*insightType = AvailableInsightType{}
	if err := requireFields(data, "id", "description"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(insightType), "id", "description", "authorization_remediation")
	insightType.AdditionalFields = extra
	return err
}

func (insightType AvailableInsightType) MarshalJSON() ([]byte, error) {
	type wire AvailableInsightType
	return marshalExtra(wire(insightType), insightType.AdditionalFields)
}

func (page *AvailableInsightTypesPage) UnmarshalJSON(data []byte) error {
	type wire AvailableInsightTypesPage
	*page = AvailableInsightTypesPage{}
	if err := requireFields(data, "data", "has_more"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(page), "data", "has_more")
	page.AdditionalFields = extra
	return err
}

func (page AvailableInsightTypesPage) MarshalJSON() ([]byte, error) {
	type wire AvailableInsightTypesPage
	return marshalExtra(wire(page), page.AdditionalFields)
}

func (items *NumberOfItems) UnmarshalJSON(data []byte) error {
	type wire NumberOfItems
	*items = NumberOfItems{}
	if err := requireFields(data, "count"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(items), "label", "count")
	items.AdditionalFields = extra
	return err
}

func (items NumberOfItems) MarshalJSON() ([]byte, error) {
	type wire NumberOfItems
	return marshalExtra(wire(items), items.AdditionalFields)
}

// UnmarshalJSON validates known value types and preserves unknown value types
// as returned by the server so new value types do not break older clients.
func (value *InsightValue) UnmarshalJSON(data []byte) error {
	type wire InsightValue
	*value = InsightValue{}
	if err := requireFields(data, "type"); err != nil {
		return err
	}
	var tag struct {
		Type InsightValueType `json:"type"`
	}
	if err := json.Unmarshal(data, &tag); err != nil {
		return err
	}
	if tag.Type != InsightValueTypeNumberOfItems {
		extra, err := unmarshalExtra(data, &tag, "type")
		value.Type = tag.Type
		value.AdditionalFields = extra
		return err
	}
	if err := requireFields(data, "number_of_items"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(value), "type", "number_of_items")
	value.AdditionalFields = extra
	return err
}

func (value InsightValue) MarshalJSON() ([]byte, error) {
	type wire InsightValue
	return marshalExtra(wire(value), value.AdditionalFields)
}

func (entry *InsightEntry) UnmarshalJSON(data []byte) error {
	type wire InsightEntry
	*entry = InsightEntry{}
	if err := requireFields(data, "label", "value"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(entry), "label", "value")
	entry.AdditionalFields = extra
	return err
}

func (entry InsightEntry) MarshalJSON() ([]byte, error) {
	type wire InsightEntry
	return marshalExtra(wire(entry), entry.AdditionalFields)
}

func (insight *Insight) UnmarshalJSON(data []byte) error {
	type wire Insight
	*insight = Insight{}
	if err := requireFields(data, "status", "id", "description"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(
		data,
		(*wire)(insight),
		"status",
		"id",
		"description",
		"error_code",
		"error_message",
		"authorization_remediation",
		"as_of",
		"data",
	)
	insight.AdditionalFields = extra
	return err
}

func (insight Insight) MarshalJSON() ([]byte, error) {
	type wire Insight
	present := make(map[string]any, len(insight.AdditionalFields)+1)
	for key, value := range insight.AdditionalFields {
		present[key] = value
	}
	if insight.Data != nil {
		present["data"] = insight.Data
	}
	return marshalExtra(wire(insight), present)
}

func (page *InsightsPage) UnmarshalJSON(data []byte) error {
	type wire InsightsPage
	*page = InsightsPage{}
	if err := requireFields(data, "data", "has_more"); err != nil {
		return err
	}
	extra, err := unmarshalExtra(data, (*wire)(page), "data", "has_more")
	page.AdditionalFields = extra
	return err
}

func (page InsightsPage) MarshalJSON() ([]byte, error) {
	type wire InsightsPage
	return marshalExtra(wire(page), page.AdditionalFields)
}
