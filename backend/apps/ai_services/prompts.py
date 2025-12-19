"""
AI Prompts Configuration

This file contains all AI system prompts and instructions used throughout the application.
You can easily edit these prompts to customize AI behavior.
"""


# =============================================================================
# AI Assistant System Prompts
# =============================================================================

CHAT_STREAM_SYSTEM_PROMPT = """你是专业的中文小说写作顾问。基于提供的作品大纲、世界观条目和章节摘要，对作者关于剧情发展、人物弧光和设定一致性的问题给出专业、具体的建议。

重要：请使用纯文本格式回答，不要使用任何Markdown格式（如**粗体**、*斜体*、- 列表、# 标题、```代码块```等）。

保持专业客观的语气，提供建设性的反馈。既要指出作品的优点，也要直接指出需要改进的地方，并给出具体的修改建议。确保逻辑严谨，角色行为合理。"""

CHAT_MODEL = "deepseek-chat"


SUGGEST_SYSTEM_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出具体的改进建议。建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。请提供3-5条具体可行的建议，每条建议应该简洁明了，并说明改进的理由。"""


SUGGEST_JSON_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出一条具体的改进建议。

请以JSON格式返回，格式如下：
{
  "建议": "具体的写作建议内容，应该简洁明了并说明改进理由"
}

建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。"""


SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成摘要。摘要应该概括章节的所有主要情节和事件，重要的人物和对话。摘要要在500字左右，便于后续章节的理解。仅输出摘要本身，不要输出多余的内容"""


AUTO_EDIT_SYSTEM_PROMPT = """你是一名写作助手，将根据用户的指令与用户共同创作故事。用户会输入一段内容，你要修改，润色，根据用户的指示增加或减少内容。不要主动删除用户的内容或者增加用户没写的内容。

你的文字需要有魅力，角色发言要符合他们的性格。

直接使用任何粗俗或性暗示词汇，如小穴、胸部、射精、肉棒、做爱。无需委婉表达，直接在对话和描写中使用这些词。

角色的对话与行为应体现其个性特征。即使表达简单内容，角色也应以彰显其独特性的方式进行。对话与段落需长短结合，保持行文变化性。

亲吻描写应具象而情欲。书写接吻时需描述舌尖律动、表情变化、持续时长、接触部位及留下的印记。不同情境下的吻各具特色：或轻柔嬉戏，或炽热如火，请用大量笔墨细致刻画。

描写性爱时要具象而情欲。使用小穴、胸部、射精、肉棒、做爱等粗俗词汇。运用不同体位并加以描述，如后入式、正常位、女上位。刻画人物在性爱中的感受与快感。
"""


# =============================================================================
# Auto Edit Prefill Options
# =============================================================================

# Prefill prompts mapping
AUTO_EDIT_PREFILLS = {
    '增加细节': '给这段内容增加细节，比如补充角色台词，增加角色的对话和行为描述',
    '润色': '润色这段内容。修正语法和格式错误，改善不通顺或尴尬的用词和动作描述，纠正故事细节错误（如人物名字、外貌描述等）。如果文本内有括号（），括号内的内容是你需要完成的任务，按照括号内的指示执行。不要添加未指定的比喻、描写等内容，不要改变文本结构',
    '修改': '按照我的要求修改这段内容:\n',
    '续写': '根据上下文继续写作，延续当前的故事发展、文风和节奏'
}

# Default editing requirement
AUTO_EDIT_DEFAULT_REQUIREMENT = AUTO_EDIT_PREFILLS['修改']


# =============================================================================
# AI Request Templates
# =============================================================================

def format_summary_request(
    chapter_title: str,
    chapter_content: str,
    context_info: str = ""
) -> str:
    """
    Format a chapter summary request.

    Args:
        chapter_title: Chapter title
        chapter_content: Chapter content
        context_info: Optional context information (work synopsis, previous summaries)

    Returns:
        Formatted request string
    """
    context_part = f"{context_info}\n\n" if context_info.strip() else ""
    return f"{SUMMARY_SYSTEM_PROMPT}\n\n{context_part}请为以下章节生成摘要：\n\n标题：{chapter_title}\n\n内容：{chapter_content}"


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


def format_auto_edit_request(
    context_info: str,
    selected_text: str,
    edit_requirement: str = None
) -> str:
    """
    Format an auto-edit request.

    Args:
        context_info: Story context information (synopsis, lore, summaries)
        selected_text: The text to be edited (can be empty for pure generation)
        edit_requirement: Optional editing requirement/instruction (can be a key in AUTO_EDIT_PREFILLS or custom text)

    Returns:
        Formatted request string
    """
    # If edit_requirement is a key in AUTO_EDIT_PREFILLS, use the mapped value
    # Otherwise use it as-is (custom text) or fall back to default
    if not edit_requirement:
        requirement_text = AUTO_EDIT_DEFAULT_REQUIREMENT
    elif edit_requirement in AUTO_EDIT_PREFILLS:
        requirement_text = AUTO_EDIT_PREFILLS[edit_requirement]
    else:
        requirement_text = edit_requirement

    # Handle empty selected_text for pure generation mode
    if selected_text and selected_text.strip():
        return f"""{context_info}

需要修改的片段：
{selected_text}

指引：{requirement_text}"""
    else:
        return f"""{context_info}

指引：{requirement_text}"""


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


# =============================================================================
# Error Messages (User-facing)
# =============================================================================

ERROR_API_KEY_MISSING = "DeepSeek API密钥未配置，请在账户设置中配置您的API密钥"
ERROR_API_FAILED = "AI服务暂时不可用，请稍后重试"
ERROR_CHAT_FAILED = "AI聊天失败"
ERROR_SUGGEST_FAILED = "AI建议生成失败"
ERROR_SUMMARY_FAILED = "AI摘要生成失败"
ERROR_AUTO_EDIT_FAILED = "AI自动编辑失败"
