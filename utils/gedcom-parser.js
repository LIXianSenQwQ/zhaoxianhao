/**
 * utils/gedcom-parser.js — GEDCOM 5.5.1 解析器（零依赖，纯函数）修复版
 */

export default class GedcomParser {
  constructor() {
    this.individuals = [];
    this.families = [];
    this.tagStack = []; // [{level, tag, value}]
    this.currentItem = null;
    this.currentContext = null; // 'birth' | 'death' | null
  }

  parse(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      this.processLine(line);
    }
    
    // flush last item
    this.flushCurrent();
    
    return { individuals: this.individuals, families: this.families };
  }

  processLine(line) {
    // GEDCOM 格式: LEVEL [XREF] TAG [VALUE]
    // 例: "0 @I1@ INDI" → level=0, xref=@I1@, tag=INDI
    // 例: "1 NAME 张三" → level=1, xref=无, tag=NAME, value=张三
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.+))?$/);
    if (!match) return; // skip invalid
    
    const level = parseInt(match[1], 10);
    const xref = match[2] || null;  // @I1@ 这种引用
    const tag = match[3];
    const value = match[4] || '';
    
    // Update tag stack
    this.tagStack.push({ level, tag, value });
    
    // Handle INDI/FAM record start (level 0 with xref)
    if (level === 0 && xref) {
      this.flushCurrent();
      this.currentContext = null; // Reset context for new record
      if (tag === 'INDI') {
        this.currentItem = { id: xref, cleanId: xref.slice(1, -1), type: 'INDI' };
      } else if (tag === 'FAM') {
        this.currentItem = { id: xref, cleanId: xref.slice(1, -1), type: 'FAM' };
      }
    }
    
    // Handle field values
    this.handleValue(tag, value);
  }

  flushCurrent() {
    if (this.currentItem) {
      if (this.currentItem.type === 'INDI') {
        this.individuals.push(this.currentItem);
      } else if (this.currentItem.type === 'FAM') {
        this.families.push(this.currentItem);
      }
      this.currentItem = null;
    }
  }

  handleValue(tag, value) {
    if (!this.currentItem) return;
    
    switch (tag) {
      case 'NAME':
        this.parseName(value);
        break;
      case 'SEX':
        this.currentItem.sex = value.toUpperCase();
        break;
      case 'BIRT':
      case 'DEAT':
        // Set parsing context
        const dateKey = tag === 'BIRT' ? 'birth' : 'death';
        this.currentContext = dateKey;
        this.currentItem[dateKey] = { date: '', place: '' };
        break;
      case 'DATE':
        if (this.currentContext && this.currentItem[this.currentContext]) {
          this.currentItem[this.currentContext].date = value;
        }
        break;
      case 'PLAC':
        if (this.currentContext && this.currentItem[this.currentContext]) {
          this.currentItem[this.currentContext].place = value;
        }
        break;
      case 'FAMS':
        if (!this.currentItem.fams) this.currentItem.fams = [];
        this.currentItem.fams.push(value);
        break;
      case 'FAMC':
        this.currentItem.famc = value;
        break;
      case 'HUSB':
        if (this.currentItem.type === 'FAM') this.currentItem.husb = value;
        break;
      case 'WIFE':
        if (this.currentItem.type === 'FAM') this.currentItem.wife = value;
        break;
      case 'CHIL':
        if (this.currentItem.type === 'FAM') {
          if (!this.currentItem.chil) this.currentItem.chil = [];
          this.currentItem.chil.push(value);
        }
        break;
    }
  }

  parseName(nameStr) {
    if (this.currentItem?.type !== 'INDI') return;
    
    const parts = nameStr.split('/');
    this.currentItem.givenName = parts[0]?.trim();
    this.currentItem.suffix = parts[1]?.trim();
    this.currentItem.nickname = parts[2]?.trim();
  }

  static convertToMember(gedItem) {
    if (!gedItem) return null;
    
    return {
      genealogyName: gedItem.givenName || '',
      name: gedItem.givenName || '',
      gender: gedItem.sex === 'M' ? 'MALE' 
             : gedItem.sex === 'F' ? 'FEMALE' 
             : 'UNKNOWN',
      birthDate: gedItem.birth?.date || '',
      deathDate: gedItem.death?.date || '',
      birthPlace: gedItem.birth?.place || '',
      deathPlace: gedItem.death?.place || '',
      gEdcomSource: '@' + (gedItem.cleanId || '') + '@',
      aliases: [
        gedItem.suffix,
        gedItem.nickname
      ].filter(Boolean)
    };
  }
}
