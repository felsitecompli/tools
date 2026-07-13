import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';

const JIRA_BASE_URL = 'https://sitecompli.atlassian.net/browse/';
const CLIENT_URL_SUFFIX = '.qa.sitecompli.com/';

const parseTicketInput = (raw) => {
  const trimmed = raw.trim();
  const hotfixMatch = trimmed.match(/^hotfix\/(.+)$/i);
  if (hotfixMatch) return { ticket: hotfixMatch[1].trim(), isHotfixBranch: true };
  return { ticket: trimmed, isHotfixBranch: false };
};

const buildTicketUrl = (ticket) => `${JIRA_BASE_URL}${ticket}`;

const parseTeamsTicketLine = (raw) => {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return null;
  const ticketMatch = label.match(/^([A-Z]+-\d+)/i);
  if (!ticketMatch) return null;
  const ticketId = ticketMatch[1].toUpperCase();
  const url = buildTicketUrl(ticketId);
  return { url, label };
};

const buildTeamsTicketLine = (ticket, prTitle, prDescription) => {
  if (!ticket) return '';
  const titlePart = prTitle.trim() || prDescription.trim().split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (!titlePart) return '';
  return `${ticket} ${titlePart}`.trim().replace(/\s+/g, ' ');
};

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildClientUrl = (ticket, isHotfix) => {
  const slug = ticket.toLowerCase();
  return `https://clients-${isHotfix ? 'hotfix-' : ''}${slug}${CLIENT_URL_SUFFIX}`;
};

const buildQaUrl = (ticket) => {
  const slug = ticket.toLowerCase();
  return `https://clients-${slug}${CLIENT_URL_SUFFIX}`;
};

const escapeForDoubleQuotedShell = (value) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

const escapeForDollarQuotedShell = (value) =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n');

const buildBranchName = (ticket, isHotfix) => (isHotfix ? `hotfix/${ticket}` : ticket);

const buildPushCommand = (ticket, isHotfix, withUpstream) => {
  if (!withUpstream) return 'git push';
  return `git push --set-upstream origin ${buildBranchName(ticket, isHotfix)}`;
};

const buildPrTitle = (ticket, prTitle) => {
  const trimmed = prTitle.trim();
  return ticket ? `${ticket} ${trimmed}` : trimmed;
};

const buildCommitCommand = (ticket, commitMessage) => {
  const escapedCommit = escapeForDoubleQuotedShell(`${ticket} ${commitMessage.trim()}`);
  return `git commit -m"${escapedCommit}"`;
};

const buildPrCreateCommand = (ticket, prTitle, prDescription, isHotfix) => {
  const escapedPrTitle = escapeForDoubleQuotedShell(buildPrTitle(ticket, prTitle));
  const baseFlag = isHotfix ? ' --base master' : '';
  const trimmedBody = prDescription?.trim() ?? '';
  if (!trimmedBody) return `gh pr create${baseFlag} --title "${escapedPrTitle}"`;
  const escapedPrBody = escapeForDollarQuotedShell(trimmedBody);
  return `gh pr create${baseFlag} --title "${escapedPrTitle}" --body $'${escapedPrBody}'`;
};

const buildGitCommand = ({ ticket, prTitle, commitMessage, prDescription, isHotfix, useUpstream }) => {
  const hasTicket = !!ticket;
  const hasCommit = !!commitMessage.trim();
  const hasPrTitle = !!prTitle.trim();
  const hasPrBody = !!prDescription.trim();

  if (hasTicket && hasCommit && hasPrTitle) {
    const commitPart = buildCommitCommand(ticket, commitMessage);
    const prPart = buildPrCreateCommand(ticket, prTitle, prDescription, isHotfix);
    return `${commitPart} && ${buildPushCommand(ticket, isHotfix, useUpstream)} && ${prPart}`;
  }
  if (hasTicket && hasCommit && !hasPrTitle) {
    return `${buildCommitCommand(ticket, commitMessage)} && ${buildPushCommand(ticket, isHotfix, useUpstream)}`;
  }
  if (!hasCommit && hasPrTitle && hasPrBody) return buildPrCreateCommand(ticket, prTitle, prDescription, isHotfix);
  if (!hasCommit && hasPrTitle) return buildPrCreateCommand(ticket, prTitle, '', isHotfix);
  return '';
};

const copyToClipboard = async (text) => {
  await navigator.clipboard.writeText(text);
};

const copyRichLinkToClipboard = async (label, url) => {
  const safeUrl = url.replace(/"/g, '&quot;');
  const html = `<a href="${safeUrl}">${escapeHtml(label)}</a>`;

  try {
    const { clipboard } = window.require('electron');
    clipboard.writeHTML(html, label);
    return;
  } catch (_) {}

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([label], { type: 'text/plain' }),
    }),
  ]);
};

const DAY_PREFIX = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const buildStashLabel = (suffix) => {
  const now = new Date();
  const dayPrefix = DAY_PREFIX[now.getDay()];
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hours24 = now.getHours();
  const minutes = now.getMinutes();
  const isPm = hours24 >= 12;
  const hours12 = hours24 % 12 || 12;
  const timeLabel = `${hours12}${String(minutes).padStart(2, '0')}${isPm ? 'pm' : 'am'}`;
  const base = `${dayPrefix}-${month}-${date}-${timeLabel}`;
  const trimmedSuffix = suffix.trim();
  return trimmedSuffix ? `${base}-${trimmedSuffix}` : base;
};

const buildStashCommand = (suffix, applyStash = true) => {
  const saveCommand = `git stash save ${buildStashLabel(suffix)}`;
  return applyStash ? `${saveCommand} && git stash apply` : saveCommand;
};

const STASH_SUFFIX_PLACEHOLDER = 'Suffix';

const resizeTextarea = (textarea) => {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const GitParse = ({ isActive = true }) => {
  const [ticket, setTicket] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [isHotfix, setIsHotfix] = useState(false);
  const [useUpstream, setUseUpstream] = useState(true);
  const [copiedTarget, setCopiedTarget] = useState(null);
  const [stashSuffix, setStashSuffix] = useState('');
  const [stashApply, setStashApply] = useState(true);
  const [stashCommand, setStashCommand] = useState('');
  const [teamsTicketLine, setTeamsTicketLine] = useState(null);
  const prDescriptionRef = useRef(null);
  const ticketInputRef = useRef(null);

  const { ticket: parsedTicket, isHotfixBranch } = useMemo(() => parseTicketInput(ticket), [ticket]);
  const effectiveIsHotfix = isHotfix || isHotfixBranch;
  const ticketUrl = useMemo(() => (parsedTicket ? buildTicketUrl(parsedTicket) : ''), [parsedTicket]);
  const gitCommand = useMemo(
    () => buildGitCommand({ ticket: parsedTicket, prTitle, commitMessage, prDescription, isHotfix: effectiveIsHotfix, useUpstream }),
    [parsedTicket, prTitle, commitMessage, prDescription, effectiveIsHotfix, useUpstream]
  );
  const clientUrl = useMemo(
    () => (parsedTicket ? buildClientUrl(parsedTicket, effectiveIsHotfix) : ''),
    [parsedTicket, effectiveIsHotfix]
  );
  const qaUrl = useMemo(() => (parsedTicket ? buildQaUrl(parsedTicket) : ''), [parsedTicket]);
  const autoTeamsTicketLine = useMemo(
    () => buildTeamsTicketLine(parsedTicket, prTitle, prDescription),
    [parsedTicket, prTitle, prDescription]
  );
  const teamsLink = useMemo(() => {
    const line = (teamsTicketLine ?? autoTeamsTicketLine).trim();
    return parseTeamsTicketLine(line);
  }, [teamsTicketLine, autoTeamsTicketLine]);
  const stashSuffixChars = Math.max(STASH_SUFFIX_PLACEHOLDER.length, stashSuffix.length);

  useEffect(() => {
    if (!isActive) return;
    ticketInputRef.current?.focus();
    ticketInputRef.current?.select();
  }, [isActive]);

  useEffect(() => {
    if (prDescriptionRef.current) resizeTextarea(prDescriptionRef.current);
  }, [prDescription]);

  const handleCopy = async (target, text) => {
    if (!text) return;
    await copyToClipboard(text);
    setCopiedTarget(target);
    setTimeout(() => setCopiedTarget(null), 1500);
  };

  const handleAddTicketUrl = () => {
    if (!ticketUrl) return;
    setPrDescription((prev) => (prev.trim() ? `${prev}\n${ticketUrl}` : ticketUrl));
  };

  const handleAddQaUrl = () => {
    if (!qaUrl) return;
    setPrDescription((prev) => (prev.trim() ? `${prev}\n${qaUrl}` : qaUrl));
  };

  const handleGenerateStashCommand = async (copyAfter = false) => {
    const command = buildStashCommand(stashSuffix, stashApply);
    setStashCommand(command);
    if (copyAfter) await handleCopy('stash', command);
  };

  const handleCopyTeamsLink = async () => {
    if (!teamsLink) return;
    await copyRichLinkToClipboard(teamsLink.label, teamsLink.url);
    setCopiedTarget('teams');
    setTimeout(() => setCopiedTarget(null), 1500);
  };

  const handleTeamsTicketLinePaste = async (event) => {
    const pasted = event.clipboardData.getData('text').trim();
    if (!pasted) return;
    event.preventDefault();
    setTeamsTicketLine(pasted);
    const link = parseTeamsTicketLine(pasted);
    if (!link) return;
    await copyRichLinkToClipboard(link.label, link.url);
    setCopiedTarget('teams');
    setTimeout(() => setCopiedTarget(null), 1500);
  };

  return (
    <div className="git-parse">
      <label className="git-parse__field git-parse__field--inline">
        <input
          ref={ticketInputRef}
          type="text"
          placeholder="Ticket #"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
        />
      </label>
      <label className="git-parse__field">
        <input
          type="text"
          placeholder="PR title"
          value={prTitle}
          onChange={(e) => setPrTitle(e.target.value)}
        />
      </label>
      <label className="git-parse__field">
        <textarea
          rows={3}
          placeholder="Commit message (without ticket #"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
        />
      </label>
      <div className="git-parse__field">
        <div className="git-parse__description-row">
          <textarea
            ref={prDescriptionRef}
            rows={3}
            className="git-parse__textarea-grow"
            placeholder="PR description (without ticket #)"
            value={prDescription}
            onChange={(e) => {
              setPrDescription(e.target.value);
              resizeTextarea(e.target);
            }}
          />
          <button type="button" className="git-parse__add-url" disabled={!ticketUrl} onClick={handleAddTicketUrl}>
            Add ticket URL
          </button>
          <button type="button" className="git-parse__add-url" disabled={!qaUrl} onClick={handleAddQaUrl}>
            Add QA URL
          </button>
        </div>
        <div className="git-parse__stash-row">
          <input
            type="text"
            className="git-parse__stash-suffix"
            placeholder={STASH_SUFFIX_PLACEHOLDER}
            value={stashSuffix}
            style={{ width: `calc(${stashSuffixChars}ch + 1.25rem)` }}
            onChange={(e) => setStashSuffix(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerateStashCommand(true);
              }
            }}
          />
          {stashCommand ? (
            <>
              <input
                type="text"
                readOnly
                className="git-parse__stash-command"
                value={stashCommand}
                title={stashCommand}
              />
            </>
          ) : null}
          <button type="button" className="git-parse__stash-btn" onClick={handleGenerateStashCommand}>
            Stash
          </button>
          <CopyButton copied={copiedTarget === 'stash'} onClick={() => handleCopy('stash', stashCommand)} />
          <label className="git-parse__checkbox">
            <input type="checkbox" checked={stashApply} onChange={(e) => setStashApply(e.target.checked)} />Apply
          </label>
        </div>
      </div>

      {(ticketUrl || clientUrl) ? (
        <section className="git-parse__output git-parse__output--links">
          {ticketUrl ? (
            <div className="git-parse__link-row">
              <a href={ticketUrl} target="_blank" rel="noreferrer">{ticketUrl}</a>
              <CopyButton copied={copiedTarget === 'url'} onClick={() => handleCopy('url', ticketUrl)} />
            </div>
          ) : null}
          {clientUrl ? (
            <div className="git-parse__link-row">
              <a href={clientUrl} target="_blank" rel="noreferrer">{clientUrl}</a>
              <label className="git-parse__checkbox">
                <input type="checkbox" checked={isHotfix} onChange={(e) => setIsHotfix(e.target.checked)} />Hotfix
              </label>
              <CopyButton copied={copiedTarget === 'client'} onClick={() => handleCopy('client', clientUrl)} />
            </div>
          ) : null}
        </section>
      ) : null}

      {gitCommand ? (
        <section className="git-parse__output">
          <div className="git-parse__output-row">
            <pre className="git-parse__command">{gitCommand}</pre>
            <label className="git-parse__checkbox git-parse__checkbox--end">
              <input type="checkbox" checked={useUpstream} onChange={(e) => setUseUpstream(e.target.checked)} />Upstream
            </label>
            <CopyButton copied={copiedTarget === 'command'} onClick={() => handleCopy('command', gitCommand)} />
          </div>
        </section>
      ) : null}

      {prDescription.trim() ? (
        <section className="git-parse__output">
          <div className="git-parse__markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{prDescription}</ReactMarkdown>
          </div>
        </section>
      ) : null}

      <div className="git-parse__field git-parse__field--compact">
        <div className="git-parse__ticket-row">
          <input
            type="text"
            className="git-parse__ticket-input"
            placeholder="Ticket # and title (string) <-- generate embeded Teams link"
            value={teamsTicketLine ?? autoTeamsTicketLine}
            onChange={(e) => setTeamsTicketLine(e.target.value)}
            onPaste={handleTeamsTicketLinePaste}
          />
          <CopyButton
            copied={copiedTarget === 'teams'}
            disabled={!teamsLink}
            onClick={handleCopyTeamsLink}
            title="Copy link"
          />
        </div>
      </div>

      {teamsLink ? (
        <section className="git-parse__output git-parse__output--links">
          <div className="git-parse__link-row">
            <a href={teamsLink.url} target="_blank" rel="noreferrer">{teamsLink.label}</a>
            <CopyButton copied={copiedTarget === 'teams'} onClick={handleCopyTeamsLink} title="Copy link" />
          </div>
          <div className="git-parse__link-row">
            <a href={teamsLink.url} target="_blank" rel="noreferrer">{teamsLink.url}</a>
            <CopyButton copied={copiedTarget === 'teams-url'} onClick={() => handleCopy('teams-url', teamsLink.url)} />
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default GitParse;
