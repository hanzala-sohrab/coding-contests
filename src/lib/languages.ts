// Judge0 CE 1.13 language IDs. timeFactor scales a problem's time limit for
// slower runtimes.
export type Language = {
  id: number;
  name: string;
  timeFactor: number;
  template: string;
};

export const LANGUAGES: Language[] = [
  {
    id: 54,
    name: "C++17 (GCC 9.2)",
    timeFactor: 1,
    template: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  },
  {
    id: 50,
    name: "C (GCC 9.2)",
    timeFactor: 1,
    template: `#include <stdio.h>

int main(void) {

    return 0;
}
`,
  },
  {
    id: 62,
    name: "Java 13 (class Main)",
    timeFactor: 2,
    template: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));

    }
}
`,
  },
  {
    id: 71,
    name: "Python 3.8",
    timeFactor: 3,
    template: `import sys
input = sys.stdin.readline


def main():
    pass


main()
`,
  },
  {
    id: 63,
    name: "JavaScript (Node.js 12)",
    timeFactor: 2,
    template: `const lines = require("fs").readFileSync(0, "utf8").split("\\n");
`,
  },
  {
    id: 60,
    name: "Go 1.13",
    timeFactor: 1,
    template: `package main

import (
\t"bufio"
\t"fmt"
\t"os"
)

func main() {
\tin := bufio.NewReader(os.Stdin)
\tout := bufio.NewWriter(os.Stdout)
\tdefer out.Flush()
\t_, _ = in, fmt.Fprintln
}
`,
  },
  {
    id: 73,
    name: "Rust 1.40",
    timeFactor: 1,
    template: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
}
`,
  },
];

export function getLanguage(id: number): Language | undefined {
  return LANGUAGES.find((l) => l.id === id);
}
