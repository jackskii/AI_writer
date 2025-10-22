"""
AI Prompts Configuration

This file contains all AI system prompts and instructions used throughout the application.
You can easily edit these prompts to customize AI behavior.
"""


# =============================================================================
# AI Assistant System Prompts
# =============================================================================

CHAT_SYSTEM_PROMPT = """你是一个专业的中文小说写作助手。请根据用户提供的上下文信息，帮助用户解答写作相关的问题，提供创意建议，讨论情节发展，或协助解决写作困难。你的回答应该专业、有建设性，并且符合中文小说的写作习惯。"""


CHAT_STREAM_SYSTEM_PROMPT = """你是中文小说写作助手。请简洁回答写作相关问题，提供创意建议或讨论情节。回答要专业、有建设性，控制在100字以内。支持Markdown格式。"""


def get_continue_prompt(token_count: int = 160) -> str:
    """
    Get the continuation writing prompt with configurable token count.

    Args:
        token_count: Number of tokens to generate (default: 160)

    Returns:
        Formatted prompt string
    """
    return f"""你是一个专业的中文小说续写助手。请直接从用户提供的文章末尾无缝继续写作，不要重复已有内容或另起段落。续写要求：
1. 从文章最后一个字符直接继续，不添加换行、空格或任何分隔
2. 符合已有的故事情节和人物设定
3. 保持一致的写作风格
4. 推进故事情节发展
5. 生成约{token_count}个tokens的内容
6. 如果有写作指导，严格按照指导进行续写
7. 续写内容必须与前文语义连贯，就像是同一段落的延续
8. 不要过度在意输出的长度。生成后不要思考生成了多少token"""


SUGGEST_SYSTEM_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出具体的改进建议。建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。请提供3-5条具体可行的建议，每条建议应该简洁明了，并说明改进的理由。"""


SUGGEST_JSON_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出一条具体的改进建议。

请以JSON格式返回，格式如下：
{
  "建议": "具体的写作建议内容，应该简洁明了并说明改进理由"
}

建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。"""


SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成简洁的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在100-200字，便于后续章节的理解。"""


# =============================================================================
# AI Request Templates
# =============================================================================

def format_continue_request(
    historic_context: str,
    current_content: str,
    guide: str = None,
    token_count: int = 160
) -> str:
    """
    Format a continuation writing request.

    Args:
        historic_context: Historical context (synopsis, lore, summaries)
        current_content: Current chapter content
        guide: Optional writing guide/instruction
        token_count: Number of tokens to generate

    Returns:
        Formatted request string
    """
    instructions = get_continue_prompt(token_count)
    historic_part = f"\n\n历史文章：{historic_context}" if historic_context.strip() else "\n\n历史文章：无"

    if guide:
        return f"{instructions}{historic_part}\n指引：{guide}\n\n正文：\n{current_content}"
    else:
        return f"{instructions}{historic_part}\n\n正文：\n{current_content}"


def format_summary_request(chapter_title: str, chapter_content: str) -> str:
    """
    Format a chapter summary request.

    Args:
        chapter_title: Chapter title
        chapter_content: Chapter content

    Returns:
        Formatted request string
    """
    return f"{SUMMARY_SYSTEM_PROMPT}\n\n请为以下章节生成摘要：\n\n标题：{chapter_title}\n\n内容：{chapter_content}"


def format_suggest_request(
    context_info: str,
    target_text: str = None
) -> str:
    """
    Format a writing suggestion request.

    Args:
        context_info: Story context information
        target_text: Optional target text to focus suggestions on

    Returns:
        Formatted request string
    """
    target_info = f"针对以下文本段落：『{target_text}』" if target_text else "针对当前章节内容"
    return f"{SUGGEST_JSON_PROMPT}\n\n{context_info}\n\n请为这个故事提供一条写作建议。{target_info}"


# =============================================================================
# Context Formatting Templates
# =============================================================================

def format_work_info(work_title: str, synopsis: str) -> str:
    """Format basic work information."""
    parts = []
    if work_title:
        parts.append(f"作品标题：{work_title}")
    if synopsis:
        parts.append(f"作品大纲：{synopsis}")
    return "\n".join(parts)


def format_lore_entries(lore_entries: list) -> str:
    """Format lore entries for context."""
    if not lore_entries:
        return ""

    lore_info = []
    for entry in lore_entries:
        lore_info.append(f"- {entry['name']}: {entry['description']}")

    return f"世界观设定：\n" + "\n".join(lore_info)


def format_chapter_summaries(summaries: list) -> str:
    """Format recent chapter summaries."""
    if not summaries:
        return ""

    return f"最近章节摘要：\n" + "\n".join(summaries)


def format_current_chapter(chapter_title: str, content: str = None) -> str:
    """Format current chapter information."""
    parts = []
    if chapter_title:
        parts.append(f"当前章节：{chapter_title}")
    if content:
        parts.append(f"当前内容：\n{content}")
    return "\n".join(parts)


# =============================================================================
# Model Configuration
# =============================================================================

DEFAULT_MODEL = "deepseek-chat"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 2000
DEFAULT_CONTINUE_TOKENS = 160


# =============================================================================
# Error Messages (User-facing)
# =============================================================================

ERROR_API_KEY_MISSING = "DeepSeek API密钥未配置，请在.env文件中设置DEEPSEEK_API_KEY"
ERROR_API_FAILED = "AI服务暂时不可用，请稍后重试"
ERROR_CHAT_FAILED = "AI聊天失败"
ERROR_CONTINUE_FAILED = "AI续写失败"
ERROR_SUGGEST_FAILED = "AI建议生成失败"
ERROR_SUMMARY_FAILED = "AI摘要生成失败"
