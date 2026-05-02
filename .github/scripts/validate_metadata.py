#!/usr/bin/env python3
"""Validate metadata.json for GNOME Shell extension."""

import json
import re
import sys


def validate_metadata():
    """Validate metadata.json structure and required fields."""
    try:
        with open('metadata.json') as f:
            meta = json.load(f)
    except FileNotFoundError:
        print("::error::metadata.json not found")
        return False
    except json.JSONDecodeError as e:
        print(f"::error::Invalid JSON in metadata.json: {e}")
        return False

    required = ['uuid', 'name', 'description', 'shell-version', 'url', 'settings-schema']
    for field in required:
        if field not in meta:
            print(f"::error::Missing required field: {field}")
            return False

    # Validate URL format (must be a valid GitHub repository URL)
    url_pattern = r'^https://github\.com/[a-zA-Z0-9-]+/[a-zA-Z0-9-._]+$'
    if not re.match(url_pattern, meta.get('url', '')):
        print("::error::URL must be a valid GitHub repository URL (e.g., https://github.com/owner/repo)")
        return False

    # Validate uuid format (GNOME Shell extension UUIDs can contain hyphens and dots)
    uuid_pattern = r'^[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(uuid_pattern, meta.get('uuid', '')):
        print(f"::error::uuid must follow the format 'name@domain' (e.g., myextension@example.com). Got: {meta.get('uuid', '')}")
        return False

    # Validate shell-version is an array of strings
    if not isinstance(meta.get('shell-version'), list):
        print("::error::shell-version must be an array of version strings")
        return False

    print("metadata.json is valid")
    return True


if __name__ == '__main__':
    success = validate_metadata()
    sys.exit(0 if success else 1)
