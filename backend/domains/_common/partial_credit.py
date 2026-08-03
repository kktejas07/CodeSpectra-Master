"""Partial credit calculators (set-overlap, Kendall tau distance)."""
from typing import List, Set, TypeVar

T = TypeVar("T")


def multi_select_partial_credit(
    selected: Set[T],
    correct: Set[T],
) -> float:
    """Calculate partial credit ratio: max(0, (correct_selected - incorrect_selected) / total_correct)."""
    if not correct:
        return 1.0 if not selected else 0.0

    correct_selected = len(selected.intersection(correct))
    incorrect_selected = len(selected.difference(correct))
    score = (correct_selected - incorrect_selected) / len(correct)
    return max(0.0, score)


def kendall_tau_distance(ranking_a: List[T], ranking_b: List[T]) -> float:
    """Calculate normalized Kendall tau distance score (1.0 = perfect match, 0.0 = completely inverted)."""
    if len(ranking_a) <= 1 or ranking_a == ranking_b:
        return 1.0

    pos_b = {item: i for i, item in enumerate(ranking_b)}
    pairs = 0
    concordant = 0
    n = len(ranking_a)

    for i in range(n):
        for j in range(i + 1, n):
            pairs += 1
            item_i = ranking_a[i]
            item_j = ranking_a[j]
            if item_i in pos_b and item_j in pos_b:
                if (pos_b[item_i] < pos_b[item_j]):
                    concordant += 1

    if pairs == 0:
        return 1.0

    return max(0.0, concordant / pairs)
