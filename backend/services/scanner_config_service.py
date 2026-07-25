import json
import hashlib
from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel

class ScannerConfigMetadata(BaseModel):
    version: int
    checksum: str
    minimumAppVersion: str
    updatedAt: str
    generatedAt: str
    schemaVersion: int

class ScannerConfigResponse(BaseModel):
    metadata: ScannerConfigMetadata
    configuration: Dict[str, Any]

class ScannerConfigService:
    def __init__(self):
        # Using an in-memory dictionary for Phase A. 
        # Future phases will load this from the DB (Phase G).
        self._current_config = {
            "profiles": {
                "serial_only": {
                    "symbologies": ["code-128", "code-39"],
                    "fps": 60,
                    "resolution": "1080p",
                    "roiRatio": {"width": 0.8, "height": 0.3},
                    "autoFocus": "continuous",
                    "zoom": 1.0,
                    "description": "Ultra-fast throughput for Code128/Code39 serials"
                },
                "dense_2d": {
                    "symbologies": ["qr", "data-matrix", "pdf417", "aztec"],
                    "fps": 30,
                    "resolution": "1080p",
                    "roiRatio": {"width": 0.6, "height": 0.6},
                    "autoFocus": "macro",
                    "zoom": 1.2,
                    "description": "High-precision decoder for QR and GS1 DataMatrix"
                },
                "warehouse_mixed": {
                    "symbologies": ["code-128", "code-39", "qr", "data-matrix", "pdf417", "ean-13"],
                    "fps": 60,
                    "resolution": "1080p",
                    "roiRatio": {"width": 0.75, "height": 0.5},
                    "autoFocus": "continuous",
                    "zoom": 1.0,
                    "description": "Adaptive mode supporting all warehouse symbologies"
                }
            },
            "rankingPolicies": {
                "default": {
                    "workflowWeight": 40,
                    "confidenceWeight": 30,
                    "roiWeight": 20,
                    "areaWeight": 10
                }
            },
            "featureFlags": {
                "adaptiveROI": True,
                "adaptiveLearning": True,
                "aiQualityAnalyzer": True,
                "gs1ParserV2": True,
                "experimentalAutofocus": False,
                "advancedRanking": True,
                "telemetryEnabled": True
            }
        }
        
        self._version = 1
        self._minimum_app_version = "2.6.0"
        self._schema_version = 1
        self._updated_at = datetime.utcnow().isoformat() + "Z"

    def _generate_checksum(self, config_dict: Dict[str, Any]) -> str:
        config_str = json.dumps(config_dict, sort_keys=True)
        return hashlib.sha256(config_str.encode('utf-8')).hexdigest()

    def get_latest_configuration(self) -> ScannerConfigResponse:
        checksum = self._generate_checksum(self._current_config)
        
        metadata = ScannerConfigMetadata(
            version=self._version,
            checksum=checksum,
            minimumAppVersion=self._minimum_app_version,
            updatedAt=self._updated_at,
            generatedAt=datetime.utcnow().isoformat() + "Z",
            schemaVersion=self._schema_version
        )
        
        return ScannerConfigResponse(
            metadata=metadata,
            configuration=self._current_config
        )

# Singleton instance
scanner_config_service = ScannerConfigService()
