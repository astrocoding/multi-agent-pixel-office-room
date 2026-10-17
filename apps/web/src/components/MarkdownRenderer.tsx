import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 bg-[#090B0A] border-2 border-[#465047] shadow-[2px_2px_0_#000000] overflow-hidden group">
      <div className="bg-[#121615] px-2.5 py-1 text-[9px] font-pixel-heading text-[#B6BFAE] border-b-2 border-[#465047] flex items-center justify-between select-none">
        <span className="uppercase tracking-wider font-bold text-[#CCF12B] flex items-center gap-1">
          <span>&gt;</span> {language || 'CODE'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[9px] font-pixel-heading uppercase text-[#B6BFAE] hover:text-[#090B0A] hover:bg-[#CCF12B] border border-[#465047] px-1.5 py-0.2 transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre className="p-2.5 text-[11px] font-pixel-mono text-[#79D693] overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar select-text cursor-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={`markdown-content text-[#F0F1DD] leading-relaxed text-[13.5px] font-pixel-body select-text cursor-text ${className}`}>
      {blocks.map((block, idx) => (
        <React.Fragment key={idx}>{block}</React.Fragment>
      ))}
    </div>
  );
};

/**
 * Parses markdown into React block elements (Headers, Lists, Codeblocks, Blockquotes, Paragraphs).
 */
function parseMarkdownBlocks(rawText: string): React.ReactNode[] {
  const lines = rawText.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  let currentListType: 'ol' | 'ul' | null = null;
  let currentListStart = 1;
  let currentListItems: string[] = [];

  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const paragraphText = currentParagraphLines.join('\n');
      elements.push(
        <p key={`p-${elements.length}`} className="mb-2 last:mb-0 leading-relaxed">
          {renderInlineWithBreaks(paragraphText)}
        </p>
      );
      currentParagraphLines = [];
    }
  };

  const flushList = () => {
    if (currentListType && currentListItems.length > 0) {
      if (currentListType === 'ol') {
        elements.push(
          <ol
            key={`ol-${elements.length}`}
            start={currentListStart}
            className="list-decimal list-outside ml-4 space-y-1 my-1.5 font-pixel-body"
          >
            {currentListItems.map((item, i) => (
              <li key={i} className="pl-1 leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc list-outside ml-4 space-y-1 my-1.5 font-pixel-body">
            {currentListItems.map((item, i) => (
              <li key={i} className="pl-1 leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
      }
      currentListType = null;
      currentListStart = 1;
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Code Block Fence (```)
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      } else {
        inCodeBlock = false;
        const codeContent = codeBlockLines.join('\n');
        elements.push(
          <CodeBlock
            key={`code-${elements.length}`}
            code={codeContent}
            language={codeBlockLang}
          />
        );
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Horizontal Rule (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      elements.push(<hr key={`hr-${elements.length}`} className="border-[#465047] my-2.5" />);
      continue;
    }

    // 3. Headers (# H1, ## H2, ### H3, #### H4)
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headerMatch) {
      flushParagraph();
      flushList();
      const level = headerMatch[1].length;
      const title = headerMatch[2];

      if (level === 1) {
        elements.push(
          <h2
            key={`h-${elements.length}`}
            className="text-sm font-bold text-[#F0F1DD] font-pixel-heading border-b-2 border-[#465047] pb-1 mt-3 mb-1.5 flex items-center gap-1.5"
          >
            <span>▶</span> {renderInline(title)}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3
            key={`h-${elements.length}`}
            className="text-xs font-bold text-[#36B9ED] font-pixel-heading mt-2.5 mb-1 flex items-center gap-1.5"
          >
            <span>▶</span> {renderInline(title)}
          </h3>
        );
      } else {
        elements.push(
          <h4
            key={`h-${elements.length}`}
            className="text-[11px] font-bold text-[#CCF12B] font-pixel-heading mt-2 mb-1 flex items-center gap-1.5"
          >
            <span>▶</span> {renderInline(title)}
          </h4>
        );
      }
      continue;
    }

    // 4. Blockquotes (> Quote)
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className="border-l-4 border-[#CCF12B] bg-[#1B211D] pl-2.5 py-1 text-[#F0F1DD] font-pixel-body my-1.5 shadow-[1px_1px_0_#000]"
        >
          {renderInline(quoteMatch[1])}
        </blockquote>
      );
      continue;
    }

    // 5. Ordered List Items (1. Item, 2. Item)
    const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (currentListType && currentListType !== 'ol') {
        flushList();
      }
      if (!currentListType) {
        currentListStart = parseInt(olMatch[1], 10) || 1;
      }
      currentListType = 'ol';
      currentListItems.push(olMatch[2]);
      continue;
    }

    // 6. Unordered List Items (- Item, * Item, • Item)
    const ulMatch = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (currentListType && currentListType !== 'ul') {
        flushList();
      }
      currentListType = 'ul';
      currentListItems.push(ulMatch[1]);
      continue;
    }

    // 7. Empty line triggers flush of paragraph and list
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    // 8. If inside a list, continuation text belongs to the previous list item
    if (currentListType && currentListItems.length > 0) {
      currentListItems[currentListItems.length - 1] += ' ' + line.trim();
      continue;
    }

    // 9. Normal text line accumulation
    currentParagraphLines.push(line);
  }

  // Flush remaining buffers
  flushParagraph();
  flushList();

  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <CodeBlock
        key={`code-end`}
        code={codeBlockLines.join('\n')}
        language={codeBlockLang}
      />
    );
  }

  return elements;
}

/**
 * Renders paragraph text preserving single line breaks (<br />).
 */
function renderInlineWithBreaks(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    result.push(renderInline(lines[i]));
    if (i < lines.length - 1) {
      result.push(<br key={`br-${i}`} />);
    }
  }

  return result;
}

/**
 * Renders text with @mentions (e.g. @Zen, @Iky, @Dre, @Gus, @Rai, @Dhea, @Boss) highlighted in sky blue linked tags.
 */
function renderTextWithMentions(content: string, keyPrefix: string | number): React.ReactNode {
  if (!content) return null;

  const mentionRegex = /(@[a-zA-Z0-9_-]+)/g;
  const parts = content.split(mentionRegex);

  return parts.map((sub, i) => {
    if (!sub) return null;
    if (sub.startsWith('@') && sub.length > 1) {
      return (
        <span
          key={`${keyPrefix}-m-${i}`}
          className="text-[#36B9ED] font-pixel-heading font-bold bg-[#0D110F] border border-[#36B9ED] px-1.5 py-0.5 text-[11px] hover:bg-[#1B211D] hover:text-[#CCF12B] hover:border-[#CCF12B] transition-colors cursor-pointer select-text inline-flex items-center gap-0.5 shadow-[1px_1px_0_#000] mx-0.5 tracking-wider uppercase align-baseline"
          title={`Mentioned agent: ${sub}`}
        >
          {sub.toUpperCase()}
        </span>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{sub}</span>;
  });
}

/**
 * Inline Tokenizer & Renderer (Bold, Italic, Code, Links, Mentions).
 */
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Match:
  // 1. Inline code: `code`
  // 2. Bold + Italic: ***text***
  // 3. Bold: **text** or __text__
  // 4. Italic: *text* or _text_
  // 5. Markdown Link: [label](url)
  const regex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline Code: `code` (styled clearly for directories, paths, commands)
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={index}
          className="px-2 py-0.5 bg-[#090B0A] text-[#79D693] font-pixel-mono text-[13px] font-semibold border border-[#465047] shadow-[1px_1px_0_#000] mx-0.5 tracking-wide inline-block align-baseline"
        >
          {code}
        </code>
      );
    }

    // Bold + Italic: ***text***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      const inner = part.slice(3, -3);
      return (
        <strong key={index} className="font-bold text-[#CCF12B]">
          {renderTextWithMentions(inner, `${index}-bi`)}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-[#F0F1DD]">
          {renderTextWithMentions(inner, `${index}-b`)}
        </strong>
      );
    }

    // Bold: __text__
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-[#F0F1DD]">
          {renderTextWithMentions(inner, `${index}-b`)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="text-[#CCF12B] font-semibold not-italic">
          {renderTextWithMentions(inner, `${index}-i`)}
        </em>
      );
    }

    // Italic: _text_
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="text-[#CCF12B] font-semibold not-italic">
          {renderTextWithMentions(inner, `${index}-i`)}
        </em>
      );
    }

    // Link: [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#36B9ED] hover:text-[#CCF12B] underline decoration-[#36B9ED] hover:decoration-[#CCF12B] underline-offset-2 transition-colors font-semibold"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Plain text with mentions
    return renderTextWithMentions(part, index);
  });
}
