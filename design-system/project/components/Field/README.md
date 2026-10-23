# Field

表单字段：标签在上、输入框在中、提示或错误在下。

- 结构：`.field` > `label` + `.input`（或 `textarea.input`）+ `.hint-s` 或 `.err`。
- 提示 `.hint-s` 说明这个字段会被用在哪、谁能看到；错误 `.err` 说怎么改。
- 每个输入框有稳定的 `id`，`label` 用 `for` 关联。
- 勾选项用 `.check`，`accent-color` 跟随背光。
