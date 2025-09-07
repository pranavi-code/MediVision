import ollama
from typing import List


def get_llm_response_for_benchmark(
    client: ollama.Client,
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    model: str = "mistral:latest",
    temperature: float = 0.7,
    top_p: float = 0.95,
    max_tokens: int = 500,
) -> str:
    """
    Get response from Ollama language model for benchmark creation.

    Args:
        client (ollama.Client): Ollama client instance
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


def create_benchmark_questions(
    client: ollama.Client,
    case_data: dict,
    model: str = "mistral:latest",
    num_questions: int = 5,
) -> List[dict]:
    """
    Generate benchmark questions for a medical case using Ollama.

    Args:
        client: Ollama client instance
        case_data: Dictionary containing case information
        model: Ollama model to use
        num_questions: Number of questions to generate

    Returns:
        List of generated questions
    """
    questions = []
    
    for i in range(num_questions):
        prompt = f"""
        Based on the following medical case, create a multiple choice question:
        
        Case: {case_data.get('description', '')}
        
        Create a challenging medical question with 4 answer choices (A, B, C, D).
        Format your response as JSON with keys: question, choices, correct_answer, explanation.
        """
        
        response = get_llm_response_for_benchmark(
            client=client,
            prompt=prompt,
            system_prompt="You are a medical expert creating educational questions.",
            model=model,
            max_tokens=800
        )
        
        questions.append({
            "question_id": f"{case_data.get('case_id', 'unknown')}_{i+1}",
            "response": response,
            "case_id": case_data.get('case_id')
        })
    
    return questions


if __name__ == "__main__":
    import os
    
    # Initialize Ollama client
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    client = ollama.Client(host=ollama_base_url)
    
    # Example usage
    sample_case = {
        "case_id": "sample_001",
        "description": "A 65-year-old patient presents with chest pain and shortness of breath."
    }
    
    questions = create_benchmark_questions(client, sample_case)
    print(f"Generated {len(questions)} questions")