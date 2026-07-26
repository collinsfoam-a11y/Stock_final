import logging
from typing import Any

from fastapi import APIRouter, Header, Response
from pydantic import BaseModel

from services.scanner_config_service import ScannerConfigResponse, scanner_config_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scanner", tags=["scanner"])


@router.get("/config", response_model=ScannerConfigResponse)
def get_scanner_config(
    response: Response, if_none_match: str | None = Header(None, alias="If-None-Match")
):
    """
    Returns the latest scanner configuration.
    Supports ETag validation via If-None-Match.
    """
    config_response = scanner_config_service.get_latest_configuration()
    etag = config_response.metadata.checksum

    # Strip quotes if client sent them
    client_etag = if_none_match.strip('"') if if_none_match else None

    if client_etag == etag:
        response.status_code = 304
        return Response(status_code=304)

    response.headers["ETag"] = f'"{etag}"'
    return config_response


# Phase B & F models
class ReplayMetadataV1(BaseModel):
    timestamp: str
    scannerProfile: str
    roiSize: dict[str, float]
    blurScore: float
    brightness: float
    decoderConfidence: float
    symbology: str
    result: str  # E.g., 'SUCCESS', 'DISCARDED_NO_MATCH'


class AnalyticsBatchPayload(BaseModel):
    device: dict[str, Any]
    appVersion: str
    configurationVersion: int
    metrics: dict[str, Any]
    replayMetadata: list[ReplayMetadataV1]


@router.post("/analytics/batch")
def upload_analytics_batch(payload: AnalyticsBatchPayload):
    """
    Ingest aggregated telemetry and privacy-safe replay metadata from the fleet.
    """
    # For Phase B & F, we accept the payload and log it.
    # In a real enterprise system, this would go into BigQuery or a timeseries DB.
    logger.info(
        f"Received analytics batch from app v{payload.appVersion} (Config v{payload.configurationVersion})"
    )
    logger.info(f"Replay events ingested: {len(payload.replayMetadata)}")

    return {"status": "ok", "message": "Batch accepted"}
