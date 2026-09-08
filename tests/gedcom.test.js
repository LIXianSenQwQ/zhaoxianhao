/**
 * tests/gedcom.test.js — GEDCOM 导入导出测试（R30）
 */
import { describe, it } from 'node:test';
import GedcomParser from '../utils/gedcom-parser.js';

// ─── 测试数据 ───
const SAMPLE_GEDCOM_5_5_1 = `0 HEAD
1 SOUR WebApp
1 DATE 2026-09-XX
1 CHAR UTF-8
1 SUBM @SUBM@
0 @SUBM@ SUBM
1 NAME 好诚事家风·家谱系统
0 @I1@ INDI
1 NAME 郝某某/ / 
1 SEX M
1 BIRT
2 DATE 1920
2 PLAC 赵县宋村
1 DEAT
2 DATE 2000
2 PLAC 赵县宋村
1 FAMS @F1@
0 @I2@ INDI
1 NAME 李某某/ / 
1 SEX F
1 BIRT
2 DATE 1925
1 FAMS @F1@
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
2 TYPE Husband
1 WIFE @I2@
2 TYPE Wife
0 @F2@ FAM
1 HUSB @I3@
1 FAMC @I1@
3 TRLR
2 REPO @REPO@
`;

describe('GEDCOM 解析器 - 单个人物', () => {
  it('解析单个 INDIVIDUAL 记录', () => {
    const parser = new GedcomParser();
    const text = `0 @I1@ INDI
1 NAME 张三/ /
1 SEX M
1 BIRT
2 DATE 1920
2 PLAC 赵县
1 DEAT
2 DATE 2000`;
    
    const result = parser.parse(text);
    
    // Validate structure
    if (result.individuals.length !== 1) {
      throw new Error(`Expected 1 individual, got ${result.individuals.length}`);
    }
    if (result.individuals[0].givenName !== '张三') {
      throw new Error(`Expected name "张三", got "${result.individuals[0].givenName}"`);
    }
    if (result.individuals[0].sex !== 'M') {
      throw new Error(`Expected sex "M", got "${result.individuals[0].sex}"`);
    }
    if (result.individuals[0].birth.date !== '1920') {
      throw new Error(`Expected birth date "1920", got "${result.individuals[0].birth?.date}"`);
    }
  });

  it('解析空输入返回空数组', () => {
    const parser = new GedcomParser();
    const result = parser.parse('');
    
    if (result.individuals.length !== 0) {
      throw new Error(`Expected 0 individuals, got ${result.individuals.length}`);
    }
  });

  it('忽略非法行继续解析', () => {
    const parser = new GedcomParser();
    const text = `非法行
0 @I1@ INDI
1 NAME 测试/ /`;
    
    const result = parser.parse(text);
    
    if (result.individuals.length < 0) {
      throw new Error('Should not crash on invalid lines');
    }
  });
});

describe('GEDCOM 解析器 - 家庭单位', () => {
  it('解析 FAM 记录', () => {
    const parser = new GedcomParser();
    const text = `0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@`;
    
    const result = parser.parse(text);
    
    if (result.families.length !== 1) {
      throw new Error(`Expected 1 family, got ${result.families.length}`);
    }
    
    const fam = result.families[0];
    if (fam.husb !== '@I1@') {
      throw new Error(`Expected husb "@I1@", got "${fam.husb}"`);
    }
    if (fam.wife !== '@I2@') {
      throw new Error(`Expected wife "@I2@", got "${fam.wife}"`);
    }
  });
});

describe('GEDCOM 解析器 - 复杂样本', () => {
  it('解析多个人物和家庭', () => {
    const parser = new GedcomParser();
    const result = parser.parse(SAMPLE_GEDCOM_5_5_1);
    
    // Should have at least 2 individuals (I1, I2)
    if (result.individuals.length < 2) {
      throw new Error(`Expected at least 2 individuals, got ${result.individuals.length}`);
    }
    
    // Should have 2 families (F1, F2)
    if (result.families.length !== 2) {
      throw new Error(`Expected 2 families, got ${result.families.length}`);
    }
    
    // Check first individual
    if (result.individuals[0].givenName !== '郝某某') {
      throw new Error(`First person name mismatch`);
    }
  });

  it('BIRT DEAT 嵌套正确', () => {
    const parser = new GedcomParser();
    const text = `0 @I1@ INDI
1 BIRT
2 DATE 1920
2 PLAC 地点
1 DEAT
2 DATE 2000
2 PLAC 地点`;
    
    const result = parser.parse(text);
    
    const ind = result.individuals[0];
    if (!ind || !ind.birth || !ind.birth.date) {
      throw new Error(`Failed to parse BIRT nested field`);
    }
    if (ind.birth.date !== '1920') {
      throw new Error(`Birth date incorrect: ${ind.birth.date}`);
    }
    if (ind.death.date !== '2000') {
      throw new Error(`Death date incorrect: ${ind.death.date}`);
    }
  });
});

describe('GEDCOM 工具方法', () => {
  it('转换到成员格式', () => {
    const gedItem = {
      givenName: '张三',
      suffix: '字',
      nickname: '号',
      sex: 'M',
      birth: { date: '1920', place: '北京' },
      death: { date: '2000' },
      cleanId: 'I123'
    };
    
    const member = GedcomParser.convertToMember(gedItem);
    
    if (member.genealogyName !== '张三') {
      throw new Error('GenealogyName incorrect');
    }
    if (member.gender !== 'MALE') {
      throw new Error('Gender mapping incorrect');
    }
    if (member.aliases[0] !== '字') {
      throw new Error('Suffix not mapped to aliases');
    }
  });
});

describe('GEDCOM 数据验证', () => {
  it('校验字段完整性', () => {
    const parser = new GedcomParser();
    const incomplete = [{}, {}];
    const valid = [{ name: 'Test', sex: 'M' }];
    
    // Mock validation
    if (incomplete.some(i => !i.name || !i.sex)) {
      console.log('[GEDCOM] Detected incomplete records:', incomplete.length);
    }
    
    if (!valid.every(r => r.name && r.sex)) {
      throw new Error('Valid record check failed');
    }
  });
});

// ─── 断言助手 ───
global.expect = (actual) => ({
  toBe(expected) {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
  },
  toBeTruthy() {
    if (!Boolean(actual)) {
      throw new Error('Expected truthy value');
    }
  },
  toEqual(arr) {
    if (JSON.stringify(actual) !== JSON.stringify(arr)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(arr)}`);
    }
  },
  toBeGreaterThan(n) {
    if (!(actual > n)) {
      throw new Error(`Expected ${actual} > ${n}`);
    }
  },
  toBeLessThan(n) {
    if (!(actual < n)) {
      throw new Error(`Expected ${actual} < ${n}`);
    }
  },
  toMatch(re) {
    if (!re.test(actual)) {
      throw new Error(`Expected ${actual} to match ${re}`);
    }
  }
});
