export const AUDIO_TYPES = [
  {
    id: 'interview',
    label: 'Interview',
    description: 'Job, research, podcast or media interviews — questions, answers and key takeaways.'
  },
  {
    id: 'meeting',
    label: 'Minutes of Meeting (MoM)',
    short: 'MoM',
    description: 'Team or client meetings — agenda, decisions, action items with owners and deadlines.'
  },
  {
    id: 'discussion',
    label: 'Discussion',
    description: 'Group discussions, debates, panels — viewpoints, arguments and conclusions.'
  },
  {
    id: 'conversation',
    label: 'Conversation',
    description: 'Calls and everyday conversations — topics, information shared and plans made.'
  },
  {
    id: 'other',
    label: 'Other audio',
    description: 'Lectures, presentations, voice notes, podcasts or anything else.'
  }
];

export const audioTypeLabel = (id, short = false) => {
  const type = AUDIO_TYPES.find((t) => t.id === id) || AUDIO_TYPES.at(-1);
  return short && type.short ? type.short : type.label;
};
