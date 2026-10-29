from django.db import transaction
from django.utils import timezone

from apps.ai_services import prompts
from apps.ai_services.services import strip_chat_reasoning

from .models import OutlineChatMessage, OutlineChatRound


def message_payload(message):
    return {
        'id': str(message.id),
        'role': message.role,
        'content': strip_chat_reasoning(message.content) if message.role == 'assistant' else message.content,
        'timestamp': message.created_at.isoformat(),
    }


def round_preview(chat_round):
    first_user = chat_round.messages.filter(role='user').order_by('created_at').first()
    if not first_user:
        return '（无作者消息）'
    text = ' '.join(first_user.content.split())
    return text[:80]


def closed_round_payloads(session):
    rounds = session.rounds.filter(closed_at__isnull=False).order_by('-closed_at')
    return [
        {
            'id': chat_round.id,
            'closed_at': chat_round.closed_at.isoformat(),
            'preview': round_preview(chat_round),
        }
        for chat_round in rounds
    ]


def ensure_open_round(session):
    chat_round = session.rounds.filter(closed_at__isnull=True).order_by('created_at').first()
    if chat_round is None:
        chat_round = OutlineChatRound.objects.create(session=session)
    if not chat_round.messages.exists():
        OutlineChatMessage.objects.create(
            session=session,
            round=chat_round,
            role='assistant',
            content=prompts.OUTLINE_PLANNER_GREETING,
        )
    return chat_round


def commit_outline_update(session, act, content, reply):
    """Close the open round only after a full outline update has been parsed."""
    with transaction.atomic():
        act.outline = content
        act.outline_autosave = timezone.now()
        act.save(update_fields=['outline', 'outline_autosave', 'updated_at'])

        chat_round = ensure_open_round(session)
        closed_at = timezone.now()
        chat_round.closed_at = closed_at
        chat_round.save(update_fields=['closed_at'])
        closed_payload = {
            'id': chat_round.id,
            'closed_at': closed_at.isoformat(),
            'preview': round_preview(chat_round),
        }

        next_round = OutlineChatRound.objects.create(session=session)
        OutlineChatMessage.objects.create(
            session=session,
            round=next_round,
            role='assistant',
            content=strip_chat_reasoning(reply),
        )
        messages = [message_payload(msg) for msg in next_round.messages.order_by('created_at')]
        return messages, closed_payload
