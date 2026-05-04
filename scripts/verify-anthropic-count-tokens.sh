#!/usr/bin/env bash
set -euo pipefail

# Verify /v1/messages/count_tokens support for Anthropic-compatible coding gateways.
# API keys are read from environment variables and never written to disk.

: "${KIMI_API_KEY:?KIMI_API_KEY is required}"
: "${DASHSCOPE_API_KEY:?DASHSCOPE_API_KEY is required}"
: "${VOLCENGINE_API_KEY:?VOLCENGINE_API_KEY is required}"

KIMI_BASE_URL="${KIMI_BASE_URL:-https://api.kimi.com/coding}"
DASHSCOPE_BASE_URL="${DASHSCOPE_BASE_URL:-https://coding.dashscope.aliyuncs.com/apps/anthropic}"
VOLCENGINE_BASE_URL="${VOLCENGINE_BASE_URL:-https://ark.cn-beijing.volces.com/api/coding}"

REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-25}"

# Optional explicit models per provider.
KIMI_MODEL="${KIMI_MODEL:-claude-sonnet-4-6}"
DASHSCOPE_MODEL="${DASHSCOPE_MODEL:-qwen3.5-plus}"
VOLCENGINE_MODEL="${VOLCENGINE_MODEL:-ark-code-latest}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

call_api() {
  local base_url="$1"
  local api_key="$2"
  local method="$3"
  local path="$4"
  local body="$5"
  local out_body="$6"

  local out_headers="${out_body}.headers"
  local status

  if [[ "$method" == "GET" ]]; then
    status="$(curl -sS --max-time "$REQUEST_TIMEOUT" -o "$out_body" -D "$out_headers" \
      -w "%{http_code}" \
      -X GET "${base_url}${path}" \
      -H "anthropic-version: 2023-06-01" \
      -H "x-api-key: ${api_key}" \
      -H "authorization: Bearer ${api_key}")"
  else
    status="$(curl -sS --max-time "$REQUEST_TIMEOUT" -o "$out_body" -D "$out_headers" \
      -w "%{http_code}" \
      -X "$method" "${base_url}${path}" \
      -H "content-type: application/json" \
      -H "anthropic-version: 2023-06-01" \
      -H "x-api-key: ${api_key}" \
      -H "authorization: Bearer ${api_key}" \
      --data "$body")"
  fi

  printf "%s" "$status"
}

json_snippet() {
  local file="$1"
  tr '\n' ' ' < "$file" | sed -E 's/[[:space:]]+/ /g' | cut -c1-280
}

discover_models() {
  local base_url="$1"
  local api_key="$2"
  local out_file="$TMP_DIR/models.json"
  local status

  status="$(call_api "$base_url" "$api_key" "GET" "/v1/models" "" "$out_file")"
  if [[ "$status" != "200" ]]; then
    echo ""
    return 0
  fi

  if jq -e '.data and (.data | type == "array")' "$out_file" >/dev/null 2>&1; then
    jq -r '.data[]?.id // empty' "$out_file"
  fi
}

pick_model() {
  local provider_name="$1"
  local base_url="$2"
  local api_key="$3"
  local preferred_model="$4"

  local -a candidates=()

  if [[ -n "$preferred_model" ]]; then
    candidates+=("$preferred_model")
  fi

  while IFS= read -r m; do
    if [[ -n "$m" ]]; then
      candidates+=("$m")
    fi
  done < <(discover_models "$base_url" "$api_key")

  candidates+=(
    "claude-sonnet-4-6"
    "claude-sonnet-4-5"
    "claude-sonnet-4-20250514"
    "claude-3-7-sonnet-20250219"
    "claude-3-5-sonnet-20241022"
    "qwen3.5-plus"
    "qwen3-coder-plus"
    "qwen-plus"
    "ark-code-latest"
    "deepseek-v3"
    "kimi-for-coding"
    "doubao-seed-1-6-thinking-250715"
  )

  local dedup_file="$TMP_DIR/candidates-${provider_name}.txt"
  printf "%s\n" "${candidates[@]}" | awk 'NF && !seen[$0]++' > "$dedup_file"

  local test_out="$TMP_DIR/${provider_name}.messages.pick.json"
  local picked_success=""
  local picked_fallback=""

  while IFS= read -r model; do
    local payload
    payload="$(jq -cn --arg model "$model" '{model:$model,max_tokens:1,messages:[{role:"user",content:"ping"}]}')"

    local status
    status="$(call_api "$base_url" "$api_key" "POST" "/v1/messages" "$payload" "$test_out")"

    # Prefer a truly usable model first.
    if [[ "$status" == "200" ]]; then
      picked_success="$model"
      break
    fi

    # Keep a fallback model for providers that reject all candidate model names.
    if [[ -z "$picked_fallback" ]] && [[ "$status" == "400" || "$status" == "422" || "$status" == "429" ]]; then
      picked_fallback="$model"
      continue
    fi

    if [[ "$status" == "401" || "$status" == "403" ]]; then
      echo ""
      return 0
    fi
  done < "$dedup_file"

  if [[ -n "$picked_success" ]]; then
    echo "$picked_success"
  else
    echo "$picked_fallback"
  fi
}

validate_provider() {
  local provider_name="$1"
  local base_url="$2"
  local api_key="$3"
  local preferred_model="$4"

  local out_messages="$TMP_DIR/${provider_name}.messages.json"
  local out_count="$TMP_DIR/${provider_name}.count.json"

  echo ""
  echo "=== ${provider_name} ==="
  echo "Base URL: ${base_url}"

  local model
  model="$(pick_model "$provider_name" "$base_url" "$api_key" "$preferred_model")"

  if [[ -z "$model" ]]; then
    echo "Model pick: failed (likely auth failure or strict model restrictions)"
    local auth_probe_payload
    auth_probe_payload='{"model":"claude-sonnet-4-5","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}'
    local auth_status
    auth_status="$(call_api "$base_url" "$api_key" "POST" "/v1/messages" "$auth_probe_payload" "$out_messages")"
    echo "/v1/messages HTTP: ${auth_status}"
    echo "messages body: $(json_snippet "$out_messages")"
    echo "Verdict: INCONCLUSIVE"
    return 0
  fi

  echo "Selected model: ${model}"

  local msg_payload
  msg_payload="$(jq -cn --arg model "$model" '{model:$model,max_tokens:8,messages:[{role:"user",content:"Return one short word."}]}')"

  local msg_status
  msg_status="$(call_api "$base_url" "$api_key" "POST" "/v1/messages" "$msg_payload" "$out_messages")"
  echo "/v1/messages HTTP: ${msg_status}"
  echo "messages body: $(json_snippet "$out_messages")"

  local count_payload
  count_payload="$(jq -cn --arg model "$model" '{model:$model,messages:[{role:"user",content:"Return one short word."}]}')"

  local count_status
  count_status="$(call_api "$base_url" "$api_key" "POST" "/v1/messages/count_tokens" "$count_payload" "$out_count")"
  echo "/v1/messages/count_tokens HTTP: ${count_status}"
  echo "count_tokens body: $(json_snippet "$out_count")"

  local verdict="INCONCLUSIVE"

  if [[ "$count_status" == "200" ]] && jq -e '.input_tokens | numbers' "$out_count" >/dev/null 2>&1; then
    verdict="SUPPORTED"
  elif [[ "$count_status" == "404" || "$count_status" == "405" ]]; then
    verdict="NOT_SUPPORTED"
  elif [[ "$count_status" == "401" || "$count_status" == "403" ]]; then
    if [[ "$msg_status" == "200" || "$msg_status" == "400" || "$msg_status" == "422" || "$msg_status" == "429" ]]; then
      verdict="AUTH_OR_PERMISSION_ISSUE_ON_COUNT_TOKENS"
    fi
  elif [[ "$count_status" == "400" || "$count_status" == "422" ]]; then
    if jq -e '.error.message? // .error?.message? // .error?.code? // "" | tostring | test("not found|No such|resource|path"; "i")' "$out_count" >/dev/null 2>&1; then
      verdict="NOT_SUPPORTED"
    elif [[ "$msg_status" == "200" ]]; then
      verdict="LIKELY_SUPPORTED_BUT_REQUEST_SCHEMA_DIFF"
    else
      verdict="INCONCLUSIVE"
    fi
  fi

  echo "Verdict: ${verdict}"
}

echo "Running Anthropic count_tokens validation at $(date '+%Y-%m-%d %H:%M:%S %z')"

validate_provider "kimi" "$KIMI_BASE_URL" "$KIMI_API_KEY" "$KIMI_MODEL"
validate_provider "dashscope" "$DASHSCOPE_BASE_URL" "$DASHSCOPE_API_KEY" "$DASHSCOPE_MODEL"
validate_provider "volcengine" "$VOLCENGINE_BASE_URL" "$VOLCENGINE_API_KEY" "$VOLCENGINE_MODEL"

echo ""
echo "Done."
