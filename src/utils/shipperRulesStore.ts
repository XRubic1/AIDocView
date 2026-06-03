import { DEFAULT_SHIPPER_RULE_ENTRIES } from '../config/reviewRulesDefaults'
import { DispatcherShipperRule } from '../types/documentPipeline'

const STORAGE_KEY = 'credyx-shipper-rules-v1'

function readRules(): DispatcherShipperRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DispatcherShipperRule[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRules(rules: DispatcherShipperRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

/** All dispatcher + default shipper rules for BOL validator prompt. */
export function getShipperRulesForPrompt(): Array<{ shipper: string; rule: string }> {
  const custom = readRules().map((rule) => ({
    shipper: rule.trigger.shipper_name ?? 'Any',
    rule: `${rule.override.field} → ${rule.override.result}: ${rule.override.reason}`,
  }))
  return [...DEFAULT_SHIPPER_RULE_ENTRIES, ...custom]
}

export function deleteDispatcherRule(ruleId: string): void {
  writeRules(readRules().filter((item) => item.rule_id !== ruleId))
}

export function saveDispatcherRule(rule: DispatcherShipperRule): void {
  const rules = readRules()
  const index = rules.findIndex((item) => item.rule_id === rule.rule_id)
  if (index >= 0) rules[index] = rule
  else rules.unshift(rule)
  writeRules(rules)
}

export function getAllDispatcherRules(): DispatcherShipperRule[] {
  return readRules()
}
