from __future__ import print_function

import sys

import requests


def main():
    urls = [
        "http://127.0.0.1:8001/api/health",
        "http://127.0.0.1:8001/healthz",
    ]

    for url in urls:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print("OK: {0}".format(url))
            else:
                print("UNAVAILABLE: {0} -> {1}".format(url, response.status_code))
        except Exception as exc:
            print("UNAVAILABLE: {0} -> {1}".format(url, exc))


if __name__ == "__main__":
    main()
    sys.exit(0)
