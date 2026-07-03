/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum ExecutionMode {
  SYNC = "sync",
  ASYNC = "async",
  STREAMING = "streaming",
}

export interface Taxonomy {
  category_tree: string[]; // e.g. ["行业领域", "金融", "风险管理"]
  primary_category: string;
  secondary_category: string;
  tertiary_category: string;
  tags: string[];
  classification_attrs: {
    difficulty_level: DifficultyLevel;
    execution_mode: ExecutionMode;
    industry: string[];
    scenario: string[];
  };
}

export interface SkillStep {
  id: string;
  name: string;
  description: string;
  pre_condition: string;
  timeout_ms: number;
  error_handling: string;
}

export interface SkillCheck {
  id: string;
  name: string;
  rule: string;
  severity: "Error" | "Warning";
}

export interface SkillExample {
  id: string;
  input: string;
  output: string;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  created_at: string;
  updated_at: string;
  
  // Taxonomy fields
  taxonomy: Taxonomy;
  
  // DOD Check status
  dod_status: "PASSED" | "FAILED" | "UNCHECKED";
  dod_report?: {
    passed: boolean;
    issues: { type: "error" | "warning"; message: string }[];
  };
  total_tokens: number;

  // Dependencies
  dependencies: string[];

  // Core Theme Definitions
  topic: {
    goal: string;
    scope: string;
  };

  // Prompts content
  content: {
    system_prompt: string;
    prompt: string; // User prompt template
  };

  // Steps, Checks, Examples
  steps: SkillStep[];
  checks: SkillCheck[];
  examples: SkillExample[];
}

export interface TaxonomyNode {
  id: string;
  name: string;
  level: number; // 1, 2, 3
  parent_id: string | null;
  sort_order: number;
}

export interface TaxonomyTreeItem {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  children?: TaxonomyTreeItem[];
  count?: number; // Number of skills in this category
}
