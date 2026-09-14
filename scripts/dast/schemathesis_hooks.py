"""Narrow Schemathesis compatibility hooks for the blocking DAST smoke.

The canonical OpenAPI document intentionally describes API-key cross-field
constraints with OpenAPI 3.1 JSON Schema conditionals. Schemathesis 4.27.1 can
validate those schemas, but its stateful data generator cannot compile the
resulting nested composition. Keep the canonical contract intact and simplify
only Schemathesis's in-memory copy, then reject only POSITIVE generated cases
that violate the same cross-field rules. Negative cases are never filtered.
"""

import schemathesis


_API_KEY_MUTATION_OPERATIONS = (
    ("/api/keys", "post"),
    ("/api/keys/{id}", "patch"),
)


def _request_schema(raw_schema, path, method):
    return raw_schema["paths"][path][method]["requestBody"]["content"]["application/json"][
        "schema"
    ]


@schemathesis.hook
def before_load_schema(ctx, raw_schema):
    del ctx
    for path, method in _API_KEY_MUTATION_OPERATIONS:
        schema = _request_schema(raw_schema, path, method)
        schema.pop("allOf", None)


def _has_nonempty_list(body, field):
    value = body.get(field)
    return isinstance(value, list) and len(value) > 0


def _valid_create_positive_body(body):
    return not (body.get("modelAccessMode") == "all" and _has_nonempty_list(body, "allowedModels"))


def _valid_patch_positive_body(body):
    if not _valid_create_positive_body(body):
        return False

    mode = body.get("connectionAccessMode")
    allowed = body.get("allowedConnections")
    if mode == "all" and _has_nonempty_list(body, "allowedConnections"):
        return False
    if mode == "restricted" and (not isinstance(allowed, list) or len(allowed) == 0):
        return False
    return True


def _is_positive_case(case):
    mode = getattr(getattr(getattr(case, "meta", None), "generation", None), "mode", None)
    return getattr(mode, "value", None) == "positive"


@schemathesis.hook
def filter_case(ctx, case):
    del ctx
    # Preserve all negative-generation traffic: the workaround exists only to
    # stop semantic-invalid bodies from being mislabeled as schema-compliant
    # positive cases after before_load_schema simplifies the generator copy.
    if not _is_positive_case(case):
        return True

    body = case.body
    if not isinstance(body, dict):
        return True

    method = case.method.upper()
    if method == "POST" and case.path == "/api/keys":
        return _valid_create_positive_body(body)
    if method == "PATCH" and case.path == "/api/keys/{id}":
        return _valid_patch_positive_body(body)
    return True
