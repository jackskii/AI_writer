def outline_messages_to_keep(messages, pairs_to_keep):
    """Return the messages the planner should send, and whether older chat was dropped.

    A pair is an assistant message followed by a user message. A trailing assistant
    message stays with the last `pairs_to_keep` complete pairs. Fewer pairs than
    requested keeps the whole chat. Zero keeps only that trailing assistant message.
    """
    pairs = []
    open_index = None
    index = 0
    while index < len(messages):
        message = messages[index]
        following = messages[index + 1] if index + 1 < len(messages) else None
        if message.role == 'assistant' and following is not None and following.role == 'user':
            pairs.append(index)
            index += 2
        elif message.role == 'assistant' and following is None:
            open_index = index
            index += 1
        else:
            index += 1

    if len(pairs) <= pairs_to_keep:
        return list(messages), False
    if pairs_to_keep == 0:
        if open_index is None:
            return [], True
        return [messages[open_index]], True
    start = pairs[-pairs_to_keep]
    return list(messages[start:]), True
