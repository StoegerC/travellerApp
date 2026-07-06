/**
 * Md – Minimaler Markdown-Renderer (GFM-Subset)
 * Unterstützt: Überschriften, fett/kursiv/durchgestrichen, Listen,
 *              Tabellen, Code, HR, Paragraphen.
 * Keine externen Abhängigkeiten.
 */
const Md = {
  render(text) {
    if (!text || !text.trim()) return '';
    return this._blocks(text.trim());
  },

  // Gibt true zurück wenn eine Zeile einen Block-Element beginnt
  _isBlock(line) {
    return (
      line.trim() === '' ||
      /^#{1,3}\s/.test(line) ||
      /^[-*+]\s/.test(line) ||
      /^\d+\.\s/.test(line) ||
      line.startsWith('```') ||
      /^[-*_]{3,}$/.test(line.trim()) ||
      line.includes('|')
    );
  },

  _blocks(text) {
    const lines = text.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line  = lines[i];
      const trim  = line.trim();

      // Leerzeile
      if (trim === '') { i++; continue; }

      // Fenced Code Block
      if (line.startsWith('```')) {
        let code = '';
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code += this._esc(lines[i]) + '\n';
          i++;
        }
        html += `<pre class="md-pre"><code>${code.trimEnd()}</code></pre>`;
        i++;
        continue;
      }

      // Tabelle (aktuelle Zeile hat | und nächste ist Trennlinie)
      if (trim.includes('|') && i + 1 < lines.length && /^\|?[\s\-|:]+\|?$/.test(lines[i + 1].trim())) {
        const tLines = [];
        while (i < lines.length && lines[i].includes('|')) {
          tLines.push(lines[i]);
          i++;
        }
        html += this._table(tLines);
        continue;
      }

      // Überschrift
      const hm = trim.match(/^(#{1,3})\s+(.+)/);
      if (hm) {
        const lvl = hm[1].length;
        html += `<h${lvl} class="md-h${lvl}">${this._inline(hm[2])}</h${lvl}>`;
        i++;
        continue;
      }

      // Horizontale Linie
      if (/^[-*_]{3,}$/.test(trim)) {
        html += '<hr class="md-hr">';
        i++;
        continue;
      }

      // Ungeordnete Liste
      if (/^[-*+]\s/.test(line)) {
        html += '<ul class="md-ul">';
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
          html += `<li>${this._inline(lines[i].replace(/^[-*+]\s/, ''))}</li>`;
          i++;
        }
        html += '</ul>';
        continue;
      }

      // Geordnete Liste
      if (/^\d+\.\s/.test(line)) {
        html += '<ol class="md-ol">';
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          html += `<li>${this._inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`;
          i++;
        }
        html += '</ol>';
        continue;
      }

      // Paragraph – sammle aufeinanderfolgende Nicht-Block-Zeilen
      const paraLines = [];
      while (i < lines.length && !this._isBlock(lines[i])) {
        paraLines.push(this._inline(lines[i]));
        i++;
      }
      if (paraLines.length) {
        html += `<p class="md-p">${paraLines.join('<br>')}</p>`;
      }
    }

    return html;
  },

  _table(lines) {
    const parse = l =>
      l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

    const [headerCells, , ...bodyRows] = lines.map(parse);
    let html = '<table class="md-table"><thead><tr>';
    headerCells.forEach(h => { html += `<th>${this._inline(h)}</th>`; });
    html += '</tr></thead><tbody>';
    bodyRows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${this._inline(cell)}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  },

  // @[Name](type:id) – Erwähnungen von Personen/Orten/Quests, eingefügt über
  // die "@"-Autovervollständigung im Journal (siehe NotesPage._attachMentionAutocomplete).
  // Der Name wird beim Einfügen eingebettet statt live nachgeschlagen, damit
  // dieser Renderer weiterhin ohne Abhängigkeit auf character.notes auskommt
  // (wird auch für Schiffs-/Ausrüstungs-Notizen ohne solche Daten genutzt) -
  // spätere Umbenennungen spiegeln sich daher nicht rückwirkend in alten
  // Journal-Einträgen wider.
  _MENTION_RE: /@\[([^\]]+)\]\((person|location|quest):([\w-]+)\)/g,

  _mentions(text) {
    return text.replace(this._MENTION_RE, (_, name, type, id) => {
      const cls = { person: 'person-link', location: 'location-link', quest: 'quest-link' }[type];
      return `<span class="link-chip mention-chip ${cls}" data-tab="${type}s" data-id="${id}">${name}</span>`;
    });
  },

  _inline(text) {
    return this._mentions(text
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;'))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g,     '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/_(.+?)_/g,       '<em>$1</em>')
      .replace(/~~(.+?)~~/g,     '<del>$1</del>')
      .replace(/`(.+?)`/g,       '<code class="md-code">$1</code>');
  },

  _esc(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
