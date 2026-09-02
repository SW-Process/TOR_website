import {
  TAXONOMY_VERSION,
  isTaxonomyCategory,
  fallbackCategory,
  type TorCategory,
} from "../../config/taxonomy";

export interface CategorizeInput {
  title: string;
  goodsCategory?: string;
  aiCategory?: string | null;
  aiTags?: string[];
}

export interface CategoryResult {
  category: TorCategory;
  tags: string[];
  taxonomyVersion: string;
}

export interface TorCategorizer {
  readonly id: string;
  readonly taxonomyVersion: string;
  categorize(input: CategorizeInput): CategoryResult;
}

export class TaxonomyCategorizer implements TorCategorizer {
  readonly id = "taxonomy-v1";
  readonly taxonomyVersion = TAXONOMY_VERSION;

  categorize(input: CategorizeInput): CategoryResult {
    const tags = input.aiTags ?? [];
    const category =
      input.aiCategory && isTaxonomyCategory(input.aiCategory)
        ? input.aiCategory
        : fallbackCategory(`${input.title} ${input.goodsCategory ?? ""} ${tags.join(" ")}`);
    return { category, tags, taxonomyVersion: this.taxonomyVersion };
  }
}

export default TaxonomyCategorizer;
