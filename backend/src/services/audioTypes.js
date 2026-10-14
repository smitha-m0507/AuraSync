// Recording types the user can choose. Each supplies domain guidance that steers what the agents look for;
// the content itself always comes from the audio.

export const AUDIO_TYPES = {
  interview: {
    label: 'Interview',
    analysis: 'This is an interview: typically an interviewer asking questions and one or more interviewees answering. '
      + 'Track each question and the substance of its answer, the interviewee\'s experience, skills, opinions and examples, '
      + 'and any evaluation, follow-up or next steps.',
    flowchart: 'Themes should be the main subjects covered by the questions; under each, the key answers, facts, skills, '
      + 'examples and figures given.',
    summary: 'Summarise who was interviewed and why, the main questions covered, the key answers, and any conclusions or next steps.'
  },
  meeting: {
    label: 'Minutes of Meeting (MoM)',
    analysis: 'This is a meeting to be turned into minutes. Identify attendees and their roles, agenda items, points '
      + 'discussed per item, decisions taken, action items with owner and deadline, figures (budgets, dates, targets) '
      + 'and open issues or risks.',
    flowchart: 'Themes should be the agenda items in the order discussed; under each, the decisions, action items (with '
      + 'owners), key figures and open issues.',
    summary: 'Write it as meeting minutes: purpose, attendees, agenda items discussed, decisions, action items with owners '
      + 'and deadlines, and open issues.'
  },
  discussion: {
    label: 'Discussion',
    analysis: 'This is a discussion or debate among participants. Capture the question or problem under discussion, each '
      + 'participant\'s viewpoint and arguments, supporting evidence and figures, points of agreement and disagreement, and conclusions.',
    flowchart: 'Themes should be the main issues debated; under each, the positions and arguments (attributed to speakers), '
      + 'evidence, and the agreements or conclusions reached.',
    summary: 'Summarise the issue discussed, the main viewpoints and who held them, where participants agreed or disagreed, '
      + 'and the conclusions.'
  },
  conversation: {
    label: 'Conversation',
    analysis: 'This is an informal conversation. Capture the topics that come up, important information exchanged (names, '
      + 'places, dates, numbers), opinions and feelings expressed, and any plans or commitments made.',
    flowchart: 'Themes should be the topics of conversation in the order they come up; under each, the key facts, opinions '
      + 'and plans mentioned.',
    summary: 'Summarise what the conversation was about, the important information shared, and any plans or commitments.'
  },
  other: {
    label: 'Other audio',
    analysis: 'The recording type is not specified (it could be a lecture, podcast, presentation, voice note, etc.). '
      + 'First infer what kind of recording it is, then capture its main subject, key concepts, facts, figures and conclusions.',
    flowchart: 'Themes should be the main sections or ideas of the recording; under each, the key concepts, facts and figures.',
    summary: 'Summarise the purpose of the recording, its main points in order, and its conclusions.'
  }
};

export const AUDIO_TYPE_IDS = Object.keys(AUDIO_TYPES);

export function audioTypeProfile(id) {
  return AUDIO_TYPES[id] || AUDIO_TYPES.other;
}
