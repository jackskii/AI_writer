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

CHAT_MODEL = "deepseek-v4-pro"


SUGGEST_SYSTEM_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出具体的改进建议。建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。请提供3-5条具体可行的建议，每条建议应该简洁明了，并说明改进的理由。"""


SUGGEST_JSON_PROMPT = """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出一条具体的改进建议。

请以JSON格式返回，格式如下：
{
  "建议": "具体的写作建议内容，应该简洁明了并说明改进理由"
}

建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。"""


SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成摘要。

**内容要求：**
• 概括章节的主要情节
• 仅对对话进行概括，不要加入具体对话
• 摘要长度约300-500字
• 不要在结尾添加分析、点评、主题总结或展望
"""


ACT_SYNOPSIS_SYSTEM_PROMPT = """你是一个专业的小说摘要助手。请根据提供的章节摘要和世界观条目，为整卷内容生成一份综合摘要。

**要求：**
• 综合所有章节摘要，概括本卷的主要情节发展脉络
• 突出本卷的关键事件、重要转折和人物发展
• 使用简略，概括性的语言。
• 摘要长度不超过2000字
• 不要在结尾添加分析、点评、主题总结或展望"""


AUTO_EDIT_SYSTEM_PROMPT = """你是一名专业的写作助手，将根据用户的指令与用户共同创作故事。

你的文字需要有魅力，角色发言要符合他们的性格。

创作原则：
- 专注于高质量的创意写作和叙事表达
- 保持创作自由，根据故事需要选择合适的表达方式
- 当情节需要时，可以使用直接、写实的描写，包括性爱或暴力场景
- 避免不必要的委婉或回避，但也不要强行加入不相关的内容
- 让描写服务于故事，而非为了描写而描写
"""


# =============================================================================
# Auto Edit Prefill Options
# =============================================================================

# Prefill prompts mapping
AUTO_EDIT_PREFILLS = {
    '增加细节': '''请在不改变剧情的前提下，优化这段文本。

默认处理原则：
- 保持前文的写作风格和对话风格。
- 润色对话和描写，符合角色性格与当下情境。
- 适当增加对话与描写，让场景更流畅。
- 按照括号里的要求进行输出
- 不要增加文本没有的内容。不要给文本续写。
- 不要过度扩写，不要堆砌细节。
- 不要给段落增加结束性描写。段落可以停在故事的一半
- 对角色性格和外貌的描写仅需要在合适的地方进行。不应该在每次角色进行动作的时候都描述。

硬性要求：
1. 严格理解并尽量满足“展开”标签中的具体要求（字数、句数、重点、风格等）。
2. 不新增原文没有的剧情。
3. 输出时删除所有控制标签，不得在结果中出现“（展开，...）”等标记。
4. 最终只输出正文，不要附加解释、说明或分析。

思考过程需要按以下步骤：
1. 确定世界观和人物设定
2. 确定当前的剧情和历史
3. 思考扩写方法
仅思考这三个步骤。完成后输出：【思考完毕，开始输出回答】''',
    '润色': '润色这段内容。修正语法和格式错误，改善不通顺或尴尬的用词和动作描述，纠正故事细节错误（如人物名字、外貌描述等）。如果文本内有括号（），括号内的内容是你需要完成的任务，按照括号内的指示执行。不要添加未指定的比喻、描写等内容，不要改变文本结构',
    '修改': '''请根据“用户修改要求”修改文本。

用户修改要求：


执行规则（必须遵守）：
1. 若用户要求与原文细节冲突（如外貌、穿着、道具、设定、时间线），一律以用户要求为准，并删除冲突细节。
2. 可以整句或整段重写，不要只做局部补丁式修改。
3. 禁止输出自相矛盾表达（例如“她扶了扶她不存在的眼镜”这类写法）。
4. 未被要求改动的剧情主线、人物关系、叙事视角保持不变。
5. 最终只输出修改后的正文，不要解释修改过程。''',
    '续写': '''根据上下文继续写作，延续当前的故事发展、文风和节奏。
    
    思考过程需要按以下步骤：
1. 确定世界观和人物设定
2. 确定当前的剧情和历史
3. 思考扩写方法
仅思考这三个步骤。完成后输出：【思考完毕，开始输出回答】''',
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
    return f"{SUMMARY_SYSTEM_PROMPT}\n\n{context_part}请为以下章节生成摘要：\n\n标题：{chapter_title}\n\n内容：{chapter_content}\n\n{chapter_title}摘要："


def format_act_synopsis_request(
    act_name: str,
    chapter_summaries: str,
    lore_entries: str = ""
) -> str:
    """
    Format an act/book synopsis request.

    Args:
        act_name: Name of the act/book
        chapter_summaries: All chapter summaries in this act, formatted
        lore_entries: Relevant lore entries that appear in this act

    Returns:
        Formatted request string
    """
    lore_part = f"\n\n**本卷涉及的世界观条目：**\n{lore_entries}" if lore_entries.strip() else ""
    return f"{ACT_SYNOPSIS_SYSTEM_PROMPT}\n\n**本卷章节摘要：**\n{chapter_summaries}{lore_part}\n\n{act_name}摘要："


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

指引：{requirement_text}

---

用户输入内容：
{selected_text}"""
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

DEFAULT_MODEL = "deepseek-v4-pro"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 2000


# =============================================================================
# Auto Describe Entry Prompt - Modular Components
# =============================================================================

# Static intro - CREATE mode
AUTO_DESCRIBE_INTRO_CREATE = "你是一位客观的角色记录员。请严格基于我提供的文本资料，提取并整理人物信息。"

# Static intro - UPDATE mode
AUTO_DESCRIBE_INTRO_UPDATE = "你是一位客观的角色记录员。你需要根据新提供的文本资料，更新现有的人物描述。"

# Static outro - CREATE mode
AUTO_DESCRIBE_OUTRO_CREATE = "开始描述："

# Static outro - UPDATE mode
AUTO_DESCRIBE_OUTRO_UPDATE = "开始更新描述："

# Update-specific bullet point (appended to middle section in update mode)
AUTO_DESCRIBE_UPDATE_BULLET = "• 整合原有描述、新资料和补充说明中的信息，保留原描述中仍然正确的信息，如果新资料与原描述冲突，以新资料为准"

# Default middle section (customizable part) - bullet points instead of numbered list
AUTO_DESCRIBE_DEFAULT_MIDDLE = """
指令（请严格遵守）：
• 主要从文本资料中提取直接描述信息
• 如果有"补充说明"，请将其中的信息也纳入描述（补充说明中的内容优先级高于文本资料推断）
• 完全按照以下格式输出，不添加任何额外文字：

名字：[角色名字]
年龄：[如果资料提及，否则写"未知"]
外观：[直接描述当前特征，如"黑色短发、身高180cm、左脸有疤痕"，不要使用比喻]
性格：[直接描述当前性格，如"内向、乐观、勇敢"，不要使用修辞手法
人物简介：[简述身份背景、角色经历和重要变化]
人际关系：[按"角色名：关系"格式列出，每行一个，最多写五个。若无明确信息则写"无明确信息"]

• 不使用markdown格式
• 总字数不超过500字
• 外观和性格只描述角色当前（故事最新进展）的状态，不要列出变化历程
• 绝对不分析角色作用、象征意义或剧情重要性"""


def get_default_lore_entry_template() -> str:
    """Return only the customizable middle section (for UI display)."""
    return AUTO_DESCRIBE_DEFAULT_MIDDLE


def build_auto_describe_prompt(custom_middle: str = "", is_update: bool = False) -> str:
    """
    Build the complete prompt from modular components.
    
    Args:
        custom_middle: Optional custom middle section (the customizable part)
        is_update: Whether this is an update to existing description
    
    Returns:
        Complete assembled prompt
    """
    # Choose intro/outro based on mode
    intro = AUTO_DESCRIBE_INTRO_UPDATE if is_update else AUTO_DESCRIBE_INTRO_CREATE
    outro = AUTO_DESCRIBE_OUTRO_UPDATE if is_update else AUTO_DESCRIBE_OUTRO_CREATE
    
    # Use custom middle or default
    middle = custom_middle.strip() if custom_middle and custom_middle.strip() else AUTO_DESCRIBE_DEFAULT_MIDDLE
    
    # Append update-specific bullet if in update mode
    if is_update:
        middle = middle + "\n" + AUTO_DESCRIBE_UPDATE_BULLET
    
    return f"{intro}\n\n{middle}\n\n{outro}"


def format_auto_describe_request(
    entry_name: str, 
    context_text: str, 
    additional_context: str = "",
    is_update: bool = False,
    original_description: str = "",
    custom_template: str = ""
) -> str:
    """
    Format an auto-describe entry request.

    Args:
        entry_name: The name of the entry/character to describe
        context_text: The chapter content to extract information from
        additional_context: Optional additional context from user
        is_update: Whether this is an update to existing description
        original_description: The original description (required if is_update=True)
        custom_template: Optional custom middle section template (only the customizable part)

    Returns:
        Formatted request string
    """
    # Build context parts
    if is_update and original_description:
        # Update mode - include original description
        parts = [f"**原有描述：**\n{original_description}"]
        parts.append(f"\n**新的文本资料：**\n{context_text}")
    else:
        # Create mode
        parts = [f"**文本资料：**\n{context_text}"]
    
    if additional_context:
        parts.append(f"\n**补充说明：**\n{additional_context}")
    
    parts.append(f"\n**需要描述的人物：** {entry_name}")
    
    # Build the complete prompt using modular components
    # custom_template is now just the middle section (customizable part)
    full_prompt = build_auto_describe_prompt(
        custom_middle=custom_template,
        is_update=is_update
    )
    parts.append(f"\n{full_prompt}")
    
    return "\n".join(parts)


# =============================================================================
# Writing Style Analysis Prompts
# =============================================================================

WRITING_STYLE_ANALYSIS_PROMPT = """你是一位专业的写作风格分析师。根据下方文本样本，生成一份可复用的写作风格指南，供AI在创作时模仿该风格。

输出要求：
- 直接输出风格指南正文，不要使用JSON、代码块或任何前后说明
- 严格按下列结构输出，保留各【】标题

输出格式：

【类型与风格概述】


【描写示例】
1. 
2. 

【对话示例】
1. 
2. 

【叙述示例】
1. 
2. 

规则：
- 【类型与风格概述】中说明体裁/类型（如喜剧、轻松、黑暗、严肃等），并用一段话概括整体风格（200-300字）
- 【描写示例】【对话示例】【叙述示例】各恰好2条，不得增减
- 示例从样本提炼写法，改写为通用句；不得包含人名、地名、情节等原作专属信息
- 不要写入参考文本中的实际内容：人称视角、体裁、角色、情节、世界观设定等
- 只描述可迁移的写作手法、语气、节奏、用词与句式习惯"""


def format_style_analysis_request(text_sample: str) -> str:
    """
    Format a writing style analysis request.

    Args:
        text_sample: The text sample to analyze

    Returns:
        Formatted request string
    """
    return f"""{WRITING_STYLE_ANALYSIS_PROMPT}

文本样本：
{text_sample}"""


NSFW_STYLE_ANALYSIS_PROMPT = """你是一位专业的成人文学写作风格分析师。根据下方NSFW文本样本，生成一份可复用的NSFW写作风格指南，供AI在创作时把握情色文本的写法与语感（非具体情节或角色）。

输出要求：
- 直接输出风格指南正文，不要使用JSON、代码块或任何前后说明
- 严格按下列结构输出，保留各【】标题

输出格式：

【描写示例】
1. 
2. 
3. 

【叙述示例】
1. 
2. 
3. 

【对话示例】
1. 
2. 
3. 

规则：
- 【描写示例】【叙述示例】【对话示例】各恰好3条，不得增减
- 所选示例应来自性爱场景，且三条之间应有差异（不同节奏、尺度或写法）
- 只提炼NSFW文本的写法与语感，不包含具体角色、情节、世界观
- 示例须改写为通用句，不含原作专属信息
- 保留原文的露骨程度与用词风格（委婉/直白）"""


def format_nsfw_style_analysis_request(text_sample: str) -> str:
    """
    Format an NSFW writing style analysis request.

    Args:
        text_sample: The text sample to analyze

    Returns:
        Formatted request string
    """
    return f"""{NSFW_STYLE_ANALYSIS_PROMPT}

文本样本：
{text_sample}"""


# =============================================================================
# Error Messages (User-facing)
# =============================================================================

ERROR_API_KEY_MISSING = "DeepSeek API密钥未配置，请在账户设置中配置您的API密钥"
ERROR_API_FAILED = "AI服务暂时不可用，请稍后重试"
ERROR_CHAT_FAILED = "AI聊天失败"
ERROR_SUGGEST_FAILED = "AI建议生成失败"
ERROR_SUMMARY_FAILED = "AI摘要生成失败"
ERROR_AUTO_EDIT_FAILED = "AI自动编辑失败"
ERROR_AUTO_DESCRIBE_FAILED = "AI自动描述失败"
ERROR_STYLE_ANALYSIS_FAILED = "写作风格分析失败"
ERROR_NSFW_STYLE_ANALYSIS_FAILED = "NSFW写作风格分析失败"