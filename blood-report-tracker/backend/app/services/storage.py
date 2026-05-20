import asyncio
from functools import partial
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",  # MinIO doesn't care about region but boto3 requires it
    )


def _ensure_bucket(client) -> None:
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
        else:
            raise


def _upload_pdf_sync(file_bytes: bytes, key: str) -> str:
    client = _get_s3_client()
    _ensure_bucket(client)
    import io
    client.upload_fileobj(
        io.BytesIO(file_bytes),
        settings.S3_BUCKET_NAME,
        key,
        ExtraArgs={"ContentType": "application/pdf"},
    )
    return key


def _get_pdf_url_sync(key: str) -> str:
    client = _get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
        ExpiresIn=3600,  # 1 hour
    )
    return url


def _delete_pdf_sync(key: str) -> None:
    client = _get_s3_client()
    client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)


def _download_pdf_sync(key: str) -> bytes:
    client = _get_s3_client()
    import io
    buffer = io.BytesIO()
    client.download_fileobj(settings.S3_BUCKET_NAME, key, buffer)
    buffer.seek(0)
    return buffer.read()


async def upload_pdf(file_bytes: bytes, key: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, partial(_upload_pdf_sync, file_bytes, key))


async def get_pdf_url(key: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, partial(_get_pdf_url_sync, key))


async def delete_pdf(key: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, partial(_delete_pdf_sync, key))


async def download_pdf(key: str) -> bytes:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, partial(_download_pdf_sync, key))
