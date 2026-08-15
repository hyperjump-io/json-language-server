import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { SelectionRangeRequest } from "vscode-languageserver";

describe("SelectionRanges", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return a nested chain of selection ranges for a string property value", async () => {
    await client.writeDocument("test.json", `{
      "foo": "bar",
      "baz": 123
    }`);

    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 1, character: 15 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 1, character: 14 },
          end: { line: 1, character: 17 }
        },
        parent: {
          range: {
            start: { line: 1, character: 13 },
            end: { line: 1, character: 18 }
          },
          parent: {
            range: {
              start: { line: 1, character: 6 },
              end: { line: 1, character: 18 }
            },
            parent: {
              range: {
                start: { line: 1, character: 6 },
                end: { line: 1, character: 19 }
              },
              parent: {
                range: {
                  start: { line: 0, character: 1 },
                  end: { line: 3, character: 4 }
                },
                parent: {
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 3, character: 5 }
                  }
                }
              }
            }
          }
        }
      }
    ]);
  });

  test("should include the trailing comma when the selected element is followed by another array element", async () => {
    await client.writeDocument("test.json", `[1, 2, 3]`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 4 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 4 },
          end: { line: 0, character: 5 }
        },
        parent: {
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 6 }
          },
          parent: {
            range: {
              start: { line: 0, character: 1 },
              end: { line: 0, character: 8 }
            },
            parent: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 9 }
              }
            }
          }
        }
      }
    ]);
  });

  test("should not include a trailing comma when the selected element is the last element in an array", async () => {
    await client.writeDocument("test.json", `[1, 2, 3]`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 7 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 8 }
        },
        parent: {
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 8 }
          },
          parent: {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 9 }
            }
          }
        }
      }
    ]);
  });

  test("should handle multiple positions in a single request, one with a following property and one without", async () => {
    await client.writeDocument("test.json", `{
      "foo": 1,
      "bar": 2
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [
        { line: 1, character: 13 },
        { line: 2, character: 13 }
      ]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 1, character: 13 },
          end: { line: 1, character: 14 }
        },
        parent: {
          range: {
            start: { line: 1, character: 6 },
            end: { line: 1, character: 14 }
          },
          parent: {
            range: {
              start: { line: 1, character: 6 },
              end: { line: 1, character: 15 }
            },
            parent: {
              range: {
                start: { line: 0, character: 1 },
                end: { line: 3, character: 4 }
              },
              parent: {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 3, character: 5 }
                }
              }
            }
          }
        }
      },
      {
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 14 }
        },
        parent: {
          range: {
            start: { line: 2, character: 6 },
            end: { line: 2, character: 14 }
          },
          parent: {
            range: {
              start: { line: 0, character: 1 },
              end: { line: 3, character: 4 }
            },
            parent: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 3, character: 5 }
              }
            }
          }
        }
      }
    ]);
  });

  test("should thread the parent chain through mixed nested objects and arrays", async () => {
    await client.writeDocument("test.json", `{
      "foo": {
        "bar": [1, 2, {"baz": true}]
      }
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 2, character: 31 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 2, character: 30 },
          end: { line: 2, character: 34 }
        },
        parent: {
          range: {
            start: { line: 2, character: 23 },
            end: { line: 2, character: 34 }
          },
          parent: {
            range: {
              start: { line: 2, character: 23 },
              end: { line: 2, character: 34 }
            },
            parent: {
              range: {
                start: { line: 2, character: 22 },
                end: { line: 2, character: 35 }
              },
              parent: {
                range: {
                  start: { line: 2, character: 16 },
                  end: { line: 2, character: 35 }
                },
                parent: {
                  range: {
                    start: { line: 2, character: 15 },
                    end: { line: 2, character: 36 }
                  },
                  parent: {
                    range: {
                      start: { line: 2, character: 8 },
                      end: { line: 2, character: 36 }
                    },
                    parent: {
                      range: {
                        start: { line: 1, character: 14 },
                        end: { line: 3, character: 6 }
                      },
                      parent: {
                        range: {
                          start: { line: 1, character: 13 },
                          end: { line: 3, character: 7 }
                        },
                        parent: {
                          range: {
                            start: { line: 1, character: 6 },
                            end: { line: 3, character: 7 }
                          },
                          parent: {
                            range: {
                              start: { line: 0, character: 1 },
                              end: { line: 4, character: 4 }
                            },
                            parent: {
                              range: {
                                start: { line: 0, character: 0 },
                                end: { line: 4, character: 5 }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);
  });

  test("should return the whole document as a single flat range for a position at the very start of the document", async () => {
    await client.writeDocument("test.json", `{"a": 1}`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 0 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 8 }
        }
      }
    ]);
  });

  test("should return a collapsed range with no parent for a position at the very end of the document", async () => {
    await client.writeDocument("test.json", `{"a": 1}\n`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 8 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 8 },
          end: { line: 0, character: 8 }
        }
      }
    ]);
  });

  test("should not return an inner range for an empty array", async () => {
    await client.writeDocument("test.json", `{"a": []}`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 7 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 8 }
        },
        parent: {
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 8 }
          },
          parent: {
            range: {
              start: { line: 0, character: 1 },
              end: { line: 0, character: 8 }
            },
            parent: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 9 }
              }
            }
          }
        }
      }
    ]);
  });

  test("should return a collapsed range with no parent when the document has no AST", async () => {
    await client.writeDocument("test.json", ``);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri },
      positions: [{ line: 0, character: 0 }]
    });

    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        }
      }
    ]);
  });
});
