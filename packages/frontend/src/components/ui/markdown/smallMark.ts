import { Mark, mergeAttributes } from '@tiptap/core';

/** Inline “Liten” for notes. Renders as <small>, never as a heading. */
export const Small = Mark.create({
  name: 'small',
  parseHTML() {
    return [{ tag: 'small' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['small', mergeAttributes(HTMLAttributes), 0];
  },
});
