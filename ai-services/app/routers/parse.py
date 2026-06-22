"""POST /parse — SEA-LION (+Gemini fallback) field-report NLP extraction."""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.parse import (
    ParseRequest,
    ParseResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services.parser import LLMError, Parser

router = APIRouter()


def get_parser(request: Request) -> Parser:
    return request.app.state.parser


@router.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, parser: Parser = Depends(get_parser)) -> ParseResponse:
    try:
        return parser.parse(req.text, id=req.id)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, parser: Parser = Depends(get_parser)) -> TranslateResponse:
    try:
        return parser.translate(req.text, id=req.id)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
