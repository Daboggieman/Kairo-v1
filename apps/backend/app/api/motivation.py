"""Daily motivation and wallpaper rendering endpoints."""

import base64
import io
import textwrap
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["motivation"], dependencies=[Depends(get_current_user)])

QUOTES = (
    ("The secret of getting ahead is getting started.", "Mark Twain"),
    ("Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"),
    ("Success is the sum of small efforts, repeated day in and day out.", "Robert Collier"),
    ("Do what you can, with what you have, where you are.", "Theodore Roosevelt"),
    ("It always seems impossible until it is done.", "Nelson Mandela"),
    ("Well done is better than well said.", "Benjamin Franklin"),
    ("The future depends on what you do today.", "Mahatma Gandhi"),
    ("Start where you are. Use what you have. Do what you can.", "Arthur Ashe"),
)


class QuoteRead(BaseModel):
    id: uuid.UUID
    text: str
    author: str
    shown_date: date


class WallpaperRequest(BaseModel):
    quote_id: uuid.UUID | None = None
    text: str = Field(min_length=1, max_length=500)
    author: str = Field(default="", max_length=120)
    background: str = Field(default="#111827", pattern=r"^#[0-9a-fA-F]{6}$")
    foreground: str = Field(default="#F9FAFB", pattern=r"^#[0-9a-fA-F]{6}$")


class WallpaperRead(BaseModel):
    media_type: str
    width: int
    height: int
    image_base64: str


def quote_for_day(day: date) -> QuoteRead:
    index = day.toordinal() % len(QUOTES)
    text, author = QUOTES[index]
    return QuoteRead(
        id=uuid.uuid5(uuid.NAMESPACE_URL, f"kairo-quote-{index}"),
        text=text,
        author=author,
        shown_date=day,
    )


@router.get("/quotes/today", response_model=QuoteRead)
def today_quote(day: date | None = None, user: User = Depends(get_current_user)) -> QuoteRead:
    del user
    return quote_for_day(day or date.today())


@router.post("/wallpapers/generate", response_model=WallpaperRead)
def generate_wallpaper(payload: WallpaperRequest) -> WallpaperRead:
    try:
        image = Image.new("RGB", (1080, 1920), payload.background)
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=52)
        author_font = ImageFont.load_default(size=32)
        lines = textwrap.wrap(payload.text, width=30)
        text_block = "\n".join(lines)
        box = draw.multiline_textbbox((0, 0), text_block, font=font, spacing=22, align="center")
        x = (1080 - (box[2] - box[0])) / 2
        y = (1920 - (box[3] - box[1])) / 2
        draw.multiline_text((x, y), text_block, fill=payload.foreground, font=font,
                            spacing=22, align="center")
        if payload.author:
            author = f"- {payload.author}"
            author_box = draw.textbbox((0, 0), author, font=author_font)
            draw.text(((1080 - (author_box[2] - author_box[0])) / 2, y + 360), author,
                      fill=payload.foreground, font=author_font)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return WallpaperRead(media_type="image/png", width=1080, height=1920,
                         image_base64=base64.b64encode(output.getvalue()).decode("ascii"))
