import ollama
from typing import List


def get_llm_response(
    client: ollama.Client,
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    model: str = "mistral:latest",
    temperature: float = 0.7,
    top_p: float = 0.95,
    max_tokens: int = 500,
) -> str:
    """
    Get response from Ollama language model.

    Args:
        client (ollama.Client): Ollama client
        prompt (str): The user prompt/question to send to the model
        system_prompt (str, optional): System prompt to set model behavior.
        model (str, optional): Ollama model to use. Defaults to "mistral:latest".
        temperature (float, optional): Controls randomness in responses. Defaults to 0.7.
        top_p (float, optional): Controls diversity via nucleus sampling. Defaults to 0.95.
        max_tokens (int, optional): Max tokens in model response. Defaults to 500.

    Returns:
        str: The model's response text
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    response = client.chat(
        model=model,
        messages=messages,
        options={
            "temperature": temperature,
            "top_p": top_p,
            "num_predict": max_tokens,
        }
    )

    return response['message']['content']