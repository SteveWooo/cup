from transformers import AutoTokenizer, AutoModel
import torch
import sys
from flask import Flask, request
import json
import os

# 模型路径
model_path = os.path.abspath(__file__).replace('bertService.py', 'bert-base-chinese')
# 加载预训练的 BERT 模型和分词器
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModel.from_pretrained(model_path)

# handle http service
app = Flask(__name__)
# http监听的端口
port = sys.argv[1]

# 定义用于处理 POST 请求的路由
@app.route("/bert", methods=["POST"])
def process_text():
    data = request.json
    text = data["text"]

    # 使用分词器对文本进行编码
    inputs = tokenizer(text, return_tensors="pt")

    # 用 BERT 模型处理编码后的文本
    outputs = model(**inputs)
    vector = outputs.last_hidden_state.mean(dim=1).squeeze().tolist()

    # 以 JSON 格式返回结果
    response = {"vector": vector, "status": 2000}
    return json.dumps(response)

# 启动 Flask 服务
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=port)