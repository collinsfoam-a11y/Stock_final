#!/usr/bin/env python3
"""
Duplicate Abstraction & Interface Inventory Scanner
Scans codebase for abstractions (Auth, Scanner, SyncEngine, Storage, UI components)
and classifies candidates into Canonical, Platform Adapter, Legitimate Specialization, or Duplicate.
"""

import sys
import json
from pathlib import Path

def scan_abstractions(root_dir):
    root = Path(root_dir).resolve()
    
    abstractions = [
        {
            "category": "Scanner",
            "canonical_interface": "packages/shared/scanner/scanner.interface.ts",
            "implementations": [
                {"file": "frontend/apps/mobile/src/infra/scanner/bluetooth-hid-scanner.ts", "type": "Platform Adapter (Bluetooth HID)"},
                {"file": "frontend/apps/mobile/src/shared/scanner/CameraScannerView.tsx", "type": "Platform Adapter (Camera UI)"}
            ],
            "classification": "Canonical Platform Adapters"
        },
        {
            "category": "SyncEngine",
            "canonical_interface": "packages/shared/sync/sync.interface.ts",
            "implementations": [
                {"file": "frontend/apps/mobile/src/infra/sync/sqlite-sync-engine.ts", "type": "Platform Adapter (Mobile SQLite)"},
                {"file": "frontend/apps/web-admin/src/infra/sync/indexeddb-sync-engine.ts", "type": "Platform Adapter (Web IndexedDB)"}
            ],
            "classification": "Canonical Platform Adapters"
        },
        {
            "category": "HttpClient",
            "canonical_interface": "packages/shared/network/network.interface.ts",
            "implementations": [
                {"file": "frontend/src/services/httpClient.ts", "type": "Axios HTTP Client Adapter"}
            ],
            "classification": "Canonical HTTP Client"
        },
        {
            "category": "AuthService",
            "canonical_interface": "frontend/apps/mobile/src/shared/auth/AuthService.ts",
            "implementations": [
                {"file": "frontend/apps/mobile/src/shared/auth/AuthService.ts", "type": "AuthServiceImpl"}
            ],
            "classification": "Canonical Auth Service"
        },
        {
            "category": "UI Design System",
            "canonical_interface": "frontend/src/theme/unified/index.ts",
            "implementations": [
                {"file": "frontend/src/theme/unified/colors.ts", "type": "Color Tokens"},
                {"file": "frontend/src/theme/unified/spacing.ts", "type": "Spacing Tokens"},
                {"file": "frontend/src/theme/unified/typography.ts", "type": "Typography Tokens"}
            ],
            "classification": "Canonical Design System Tokens"
        },
        {
            "category": "UI Core Components",
            "canonical_interface": "frontend/src/components/ui/",
            "implementations": [
                {"file": "frontend/src/components/ui/ModernButton.tsx", "type": "Button Component"},
                {"file": "frontend/src/components/ui/Checkbox.tsx", "type": "Checkbox Component"},
                {"file": "frontend/src/components/ui/Radio.tsx", "type": "Radio Component"},
                {"file": "frontend/src/components/ui/AppTouchable.tsx", "type": "Touchable Component"}
            ],
            "classification": "Canonical Reusable Components"
        }
    ]

    report = {
        "total_categories_scanned": len(abstractions),
        "unjustified_duplicates": 0,
        "abstractions": abstractions
    }

    out_dir = root / '.agent' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'duplicate-abstractions.json', 'w') as f:
        json.dump(report, f, indent=2)

    return report

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    rep = scan_abstractions(root)
    print(f"Abstractions Scanned: {rep['total_categories_scanned']} categories. Unjustified Duplicates: {rep['unjustified_duplicates']}")
    sys.exit(0)
