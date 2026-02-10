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


SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成摘要。

**内容要求：**
• 概括章节的主要情节和事件发展
• 记录重要的人物行为和关键对话
• 摘要长度约300-500字
• 不要在结尾添加分析、点评、主题总结或展望

**视角要求：**
• 保持与原文相同的叙事视角
• 如果原文是第一人称，摘要也用第一人称
• 不要切换视角或添加旁白式的描述"""


ACT_SYNOPSIS_SYSTEM_PROMPT = """你是一个专业的小说摘要助手。请根据提供的章节摘要和世界观条目，为整卷内容生成一份综合摘要。

**要求：**
• 综合所有章节摘要，概括本卷的主要情节发展脉络
• 突出本卷的关键事件、重要转折和人物发展
• 保持与原文相同的叙事视角
• 使用简略，概括性的语言。概括对话和细节描写
• 不要切换视角或添加旁白式的描述
• 摘要长度不超过2000字
• 不要在结尾添加分析、点评、主题总结或展望"""


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
    '增加细节': '''给这段内容增加细节。

**段落标记系统：**
如果段落末尾有以下标记，请按标记要求处理该段落：
• (对话) - 为该段落补充角色对话和互动
• (描写) - 为该段落增动作和对话描写
• (展开) - 将该段落详细展开，丰富细节和描述
• (润色) - 仅修正语法和错别字，不增加任何新内容

如果段落没有标记，则按默认方式处理：适当补充角色台词，增加对话和行为描述。

处理完成后，移除所有标记符号，输出干净的文本。''',
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

WRITING_STYLE_ANALYSIS_PROMPT = """你是一位专业的写作风格分析师。请根据以下文本样本，提取并生成一份可复用的写作风格指南。这份指南将用于指导AI模仿这种风格进行创作。

重要原则：
1. 生成通用的风格描述，不要包含具体角色名字、地名、情节等样本特定内容
2. 提取可迁移的写作技巧、句式模式、用词习惯等
3. 示例句要足够长且完整（至少50-100字），能充分展现该维度的风格特征
4. 示例要有代表性，让AI能从中学习到具体的写作模式

请从以下维度提取写作风格：

1. **句式特点**：句子长度偏好、结构复杂度、特殊句式使用规律（如倒装、排比、反问等）
2. **词汇风格**：用词倾向（口语/书面语、古典/现代、简洁/华丽）、特色词汇类型、修饰语使用习惯
3. **节奏韵律**：叙述节奏快慢、段落长短控制、信息密度、张弛有度的手法
4. **对话风格**：对话呈现方式、语气特点、对话标签使用、对话与叙述的比例
5. **描写手法**：描写详略程度、感官运用偏好、比喻修辞习惯、环境/心理/动作描写特色

输出要求：
- 总体描述：100-150字，概括这种风格的整体特征、可能的文学流派/类型、风格相近的知名作家
- 每个维度：详细描述（150-200字）+ 3-5个示例句（每个示例50-100字）
- 示例必须从原文摘取，但要去除具体人名、地名（可用"他/她"、"某地"等替代）

必须返回完整的JSON，包含overall字段和所有5个维度。

请严格按照以下JSON格式返回：
{{
  "overall": "这种风格整体呈现...（100-150字的总体描述，包括流派、类型、相似作家等）",
  "perspectives": [
    {{
      "name": "句式特点",
      "description": "详细描述句式风格的通用特征...",
      "examples": ["示例句1（50-100字，已去除具体人名地名）", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "词汇风格",
      "description": "详细描述用词习惯...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "节奏韵律",
      "description": "详细描述节奏控制...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "对话风格",
      "description": "详细描述对话特点...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "描写手法",
      "description": "详细描述描写方式...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }}
  ]
}}"""


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


NSFW_STYLE_ANALYSIS_PROMPT = """你是一位专业的成人文学写作风格分析师。请根据以下NSFW文本样本，提取并生成一份可复用的情色写作风格指南。这份指南将用于指导AI模仿这种风格进行NSFW内容创作。

重要原则：
1. 生成通用的风格描述，不要包含具体角色名字、关系、情节等样本特定内容
2. 提取可迁移的情色描写技巧、用词习惯、节奏控制等写作模式
3. 示例句要足够长且完整（至少50-100字），能充分展现该维度的风格特征和尺度
4. 示例要有代表性，让AI能从中学习到具体的情色描写手法
5. 保留原文的露骨程度和用词风格（委婉/直白），这是风格的核心特征

请从以下维度提取写作风格：

1. **情欲描写**：情欲场景的描写手法、尺度把握（委婉/露骨）、感官刺激呈现方式、场景推进节奏
2. **身体描写**：身体部位描写的详略程度、用词风格（优美/粗俗）、触感表现手法、敏感部位描写习惯
3. **动作描写**：亲密动作的描写细节程度、动作节奏快慢、动词选择倾向、动态感营造技巧
4. **对话风格**：情色对话的语气特点、用词直白程度、喘息呻吟的表现方式、对话推进情欲的手法
5. **氛围营造**：情欲氛围的铺垫方式、情绪递进节奏、高潮前后的节奏控制、环境渲染手法
6. **心理描写**：欲望/羞耻/快感等心理的刻画深度、内心独白风格、心理与生理反应的结合方式

输出要求：
- 总体描述：100-150字，概括这种NSFW风格的整体特征、尺度定位（软色情/硬核）、可能的题材类型、风格相近的作家/作品
- 每个维度：详细描述（150-200字）+ 3-5个示例句（每个示例50-100字，保留完整的情色描写）
- 示例必须从原文摘取，但要去除具体人名、关系称呼（可用"他/她"、"对方"等替代）
- 示例必须保留原文的露骨程度和情色用词，这是学习风格的关键

必须返回完整的JSON，包含overall字段和所有6个维度。

请严格按照以下JSON格式返回：
{{
  "overall": "这种NSFW风格整体呈现...（100-150字的总体描述，包括尺度、题材、相似作品等）",
  "perspectives": [
    {{
      "name": "情欲描写",
      "description": "详细描述情欲场景风格的通用特征...",
      "examples": ["示例句1（50-100字，保留完整情色内容，已去除具体人名）", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "身体描写",
      "description": "详细描述身体描写习惯...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "动作描写",
      "description": "详细描述动作描写方式...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "对话风格",
      "description": "详细描述对话特点...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "氛围营造",
      "description": "详细描述氛围控制...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "心理描写",
      "description": "详细描述心理刻画...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }}
  ]
}}"""


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