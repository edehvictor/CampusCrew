import { Bike, BookOpen, CodeXml, PaintRoller, Scissors, Sparkles } from "lucide-react";
import type { Category } from "./model";

const icons = {
  Cleaning: Sparkles,
  "Hair & beauty": Scissors,
  Tutoring: BookOpen,
  Repairs: PaintRoller,
  "Tech & design": CodeXml,
  Errands: Bike,
};

export function CategoryIcon({ category }: { category: Category }) {
  const Icon = icons[category];
  return (
    <span className="category-icon" data-category={category} aria-hidden="true">
      {Icon && <Icon size={19} />}
    </span>
  );
}
