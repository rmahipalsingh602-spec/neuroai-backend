from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str, **extra):
    detail = {"code": code, "message": message}
    if extra:
        detail.update(extra)
    raise HTTPException(status_code=status_code, detail=detail)
