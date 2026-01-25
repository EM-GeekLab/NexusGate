#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "httpx>=0.25.0",
# ]
# ///
"""
NexusGate Prometheus Metrics API Test

Tests the /metrics endpoint returns valid Prometheus format metrics.

Usage:
    uv run test_metrics.py

Environment variables:
    NEXUSGATE_BASE_URL: NexusGate service address (default: http://localhost:3000)
"""

import os
import re
import sys
import httpx

# Configuration
BASE_URL = os.getenv("NEXUSGATE_BASE_URL", "http://localhost:3000")
METRICS_URL = f"{BASE_URL}/metrics"


def parse_prometheus_metrics(text: str) -> dict[str, list[dict]]:
    """
    Parse Prometheus metrics text format into a structured dict.

    Returns:
        dict mapping metric names to list of {labels: dict, value: float}
    """
    metrics: dict[str, list[dict]] = {}
    current_metric = None

    for line in text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue

        # Skip HELP and TYPE lines
        if line.startswith('# HELP'):
            current_metric = line.split()[2] if len(line.split()) > 2 else None
            if current_metric and current_metric not in metrics:
                metrics[current_metric] = []
            continue
        if line.startswith('# TYPE'):
            continue
        if line.startswith('#'):
            continue

        # Parse metric line: metric_name{labels} value
        # or: metric_name value
        match = re.match(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+(.+)$', line)
        if match:
            name, labels_str, value = match.groups()
            # Parse labels
            labels = {}
            if labels_str:
                for label in labels_str.split(','):
                    if '=' in label:
                        k, v = label.split('=', 1)
                        labels[k] = v.strip('"')
            if name not in metrics:
                metrics[name] = []
            metrics[name].append({'labels': labels, 'value': float(value)})
        else:
            # No labels
            match = re.match(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(.+)$', line)
            if match:
                name, value = match.groups()
                if name not in metrics:
                    metrics[name] = []
                metrics[name].append({'labels': {}, 'value': float(value)})

    return metrics


def test_metrics_endpoint_returns_200():
    """Test that /metrics endpoint returns 200 OK"""
    print("=" * 50)
    print("Testing /metrics endpoint returns 200")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print(f"Status: {response.status_code} OK")
    print()


def test_metrics_content_type():
    """Test that /metrics returns correct Content-Type"""
    print("=" * 50)
    print("Testing /metrics Content-Type header")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    content_type = response.headers.get('content-type', '')
    assert 'text/plain' in content_type, f"Expected text/plain, got {content_type}"
    print(f"Content-Type: {content_type}")
    print()


def test_metrics_contains_expected_metrics():
    """Test that /metrics contains expected NexusGate metrics"""
    print("=" * 50)
    print("Testing /metrics contains expected metrics")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    content = response.text

    # List of metrics that should always be present
    expected_metrics = [
        'nexusgate_info',
        'nexusgate_active_api_keys',
        'nexusgate_active_providers',
        'nexusgate_active_models',
    ]

    # Optional metrics (may not be present if no data)
    optional_metrics = [
        'nexusgate_completions_total',
        'nexusgate_embeddings_total',
        'nexusgate_tokens_prompt_total',
        'nexusgate_tokens_completion_total',
        'nexusgate_tokens_embedding_total',
        'nexusgate_completion_duration_seconds',
        'nexusgate_completion_ttft_seconds',
        'nexusgate_embedding_duration_seconds',
    ]

    # Check required metrics
    for metric in expected_metrics:
        assert metric in content, f"Missing expected metric: {metric}"
        print(f"  Found: {metric}")

    # Check optional metrics (just report, don't fail)
    for metric in optional_metrics:
        if metric in content:
            print(f"  Found: {metric}")
        else:
            print(f"  Not found (no data): {metric}")

    print()


def test_metrics_prometheus_format():
    """Test that /metrics output is valid Prometheus format"""
    print("=" * 50)
    print("Testing Prometheus format validity")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    content = response.text

    # Check for required format elements
    assert '# HELP' in content, "Missing # HELP comments"
    assert '# TYPE' in content, "Missing # TYPE comments"
    print("  Has # HELP comments: Yes")
    print("  Has # TYPE comments: Yes")

    # Parse and validate
    metrics = parse_prometheus_metrics(content)
    print(f"  Parsed {len(metrics)} metric families")

    # Check info metric has version label
    assert 'nexusgate_info' in metrics, "Missing nexusgate_info metric"
    info_metric = metrics['nexusgate_info']
    assert len(info_metric) > 0, "nexusgate_info has no values"
    assert 'version' in info_metric[0]['labels'], "nexusgate_info missing version label"
    print(f"  nexusgate_info version: {info_metric[0]['labels']['version']}")

    print()


def test_metrics_gauge_values():
    """Test that gauge metrics have valid values"""
    print("=" * 50)
    print("Testing gauge metric values")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    metrics = parse_prometheus_metrics(response.text)

    # Check active_api_keys is a valid number >= 0
    assert 'nexusgate_active_api_keys' in metrics
    api_keys_value = metrics['nexusgate_active_api_keys'][0]['value']
    assert api_keys_value >= 0, f"Invalid api_keys value: {api_keys_value}"
    print(f"  nexusgate_active_api_keys: {int(api_keys_value)}")

    # Check active_providers is a valid number >= 0
    assert 'nexusgate_active_providers' in metrics
    providers_value = metrics['nexusgate_active_providers'][0]['value']
    assert providers_value >= 0, f"Invalid providers value: {providers_value}"
    print(f"  nexusgate_active_providers: {int(providers_value)}")

    # Check active_models
    assert 'nexusgate_active_models' in metrics
    for entry in metrics['nexusgate_active_models']:
        model_type = entry['labels'].get('type', 'unknown')
        value = entry['value']
        assert value >= 0, f"Invalid models value: {value}"
        print(f"  nexusgate_active_models{{type=\"{model_type}\"}}: {int(value)}")

    print()


def test_metrics_histogram_format():
    """Test histogram metrics have correct bucket format (if present)"""
    print("=" * 50)
    print("Testing histogram metric format")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    content = response.text

    histogram_names = [
        'nexusgate_completion_duration_seconds',
        'nexusgate_completion_ttft_seconds',
        'nexusgate_embedding_duration_seconds',
    ]

    for hist_name in histogram_names:
        if f'{hist_name}_bucket' in content:
            print(f"  {hist_name}:")
            # Check bucket, sum, count exist
            assert f'{hist_name}_bucket' in content, f"Missing _bucket for {hist_name}"
            assert f'{hist_name}_sum' in content, f"Missing _sum for {hist_name}"
            assert f'{hist_name}_count' in content, f"Missing _count for {hist_name}"
            # Check +Inf bucket exists
            assert f'{hist_name}_bucket{{' in content and 'le="+Inf"' in content, \
                f"Missing +Inf bucket for {hist_name}"
            print(f"    Has _bucket: Yes")
            print(f"    Has _sum: Yes")
            print(f"    Has _count: Yes")
            print(f"    Has +Inf bucket: Yes")
        else:
            print(f"  {hist_name}: No data (skipped)")

    print()


def test_show_sample_output():
    """Display a sample of the metrics output"""
    print("=" * 50)
    print("Sample metrics output (first 50 lines)")
    print("=" * 50)

    response = httpx.get(METRICS_URL, timeout=10.0)
    lines = response.text.strip().split('\n')
    for line in lines[:50]:
        print(f"  {line}")
    if len(lines) > 50:
        print(f"  ... ({len(lines) - 50} more lines)")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("   NexusGate - Prometheus Metrics API Tests")
    print(f"   Target: {METRICS_URL}")
    print("=" * 60 + "\n")

    tests = [
        test_metrics_endpoint_returns_200,
        test_metrics_content_type,
        test_metrics_contains_expected_metrics,
        test_metrics_prometheus_format,
        test_metrics_gauge_values,
        test_metrics_histogram_format,
        test_show_sample_output,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"FAILED: {test.__name__}")
            print(f"  Error: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR: {test.__name__}")
            print(f"  {type(e).__name__}: {e}")
            failed += 1

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    print("\nAll Prometheus metrics tests passed!")
