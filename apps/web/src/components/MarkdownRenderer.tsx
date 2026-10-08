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
    <div className="my-2 rounded-md bg-slate-950 border border-slate-800 overflow-hidden shadow-inner group">
      <div className="bg-slate-900/80 px-2.5 py-1 text-[9px] font-mono text-slate-400 border-b border-slate-800 flex items-center justify-between select-none">
        <span className="uppercase tracking-wider font-semibold text-slate-400">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
          title="Copy code"
        >
          {copied ? <span className="text-emerald-400 font-sans">Copied</span> : <span>Copy</span>}
        </button>
      </div>
      <pre className="p-2.5 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar select-text cursor-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={`markdown-content text-slate-300 leading-relaxed text-[11px] select-text cursor-text ${className}`}>
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
          <ol key={`ol-${elements.length}`} className="list-decimal list-outside ml-4 space-y-1 my-1.5">
            {currentListItems.map((item, i) => (
              <li key={i} className="pl-1 leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc list-outside ml-4 space-y-1 my-1.5">
            {currentListItems.map((item, i) => (
              <li key={i} className="pl-1 leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
      }
      currentListType = null;
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
      elements.push(<hr key={`hr-${elements.length}`} className="border-slate-800 my-2.5" />);
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
          <h2 key={`h-${elements.length}`} className="text-sm font-bold text-white border-b border-slate-800 pb-1 mt-3 mb-1.5 flex items-center gap-1.5">
            {renderInline(title)}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3 key={`h-${elements.length}`} className="text-xs font-bold text-sky-400 mt-2.5 mb-1 flex items-center gap-1.5">
            {renderInline(title)}
          </h3>
        );
      } else {
        elements.push(
          <h4 key={`h-${elements.length}`} className="text-[11px] font-bold text-amber-400 mt-2 mb-1 flex items-center gap-1.5">
            {renderInline(title)}
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
          className="border-l-2 border-amber-500/70 bg-slate-950/40 pl-2.5 py-1 text-slate-300 italic my-1.5 rounded-r"
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

    // 8. Normal text line accumulation
    if (currentListType) {
      flushList();
    }
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
 * Inline Tokenizer & Renderer (Bold, Italic, Code, Links).
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

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-emerald-300 font-mono text-[10.5px] border border-slate-700/60 shadow-xs"
        >
          {code}
        </code>
      );
    }

    // Bold + Italic: ***text***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      const inner = part.slice(3, -3);
      return (
        <strong key={index} className="font-bold italic text-amber-200">
          {inner}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-slate-100">
          {inner}
        </strong>
      );
    }

    // Bold: __text__
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-slate-100">
          {inner}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="italic text-amber-200/90 font-medium">
          {inner}
        </em>
      );
    }

    // Italic: _text_
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="italic text-amber-200/90 font-medium">
          {inner}
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
          className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors font-medium"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Plain text
    return <span key={index}>{part}</span>;
  });
}

