You are given an array `a₁, a₂, …, aₙ` and `q` queries. Each query is a pair `l r`; answer it with `aₗ + aₗ₊₁ + … + aᵣ`.

## Input

The first line contains `n` and `q` (1 ≤ n, q ≤ 10⁵).

The second line contains `n` integers `aᵢ` (−10⁹ ≤ aᵢ ≤ 10⁹).

Each of the next `q` lines contains two integers `l` and `r` (1 ≤ l ≤ r ≤ n).

## Output

For each query, print the sum on its own line.

## Note

An O(n·q) solution will not pass. Use fast input/output.
