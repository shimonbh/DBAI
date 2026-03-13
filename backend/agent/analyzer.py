"""
QueryAnalyzerAgent — analyzes SQL for issues and produces an improved version.
Returns a structured dict with summary, issues, suggestions, and improved_sql.
"""
import re
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, QUERY_ANALYSIS


class QueryAnalyzerAgent:
    """Analyzes SQL correctness, performance, and returns structured improvement suggestions."""

    def __init__(self, db_type: str, schema_context: str):
        self.db_type = db_type
        self.schema_context = schema_context

    async def analyze(
        self,
        sql: str,
        provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 1500,
    ) -> dict:
        """
        Analyze the SQL and return:
        {summary, issues: [...], suggestions: [...], improved_sql, raw}
        """
        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        user_msg = QUERY_ANALYSIS.format(db_type=self.db_type, sql=sql)
        messages = [{"role": "user", "content": user_msg}]

        raw = await ai.complete(system, messages, model=model, max_tokens=max_tokens)
        return self._parse(raw)

    @staticmethod
    def _parse(raw: str) -> dict:
        """
        Extract structured sections from the LLM response.
        Expects sections: ## Summary, ## Issues, ## Suggestions, ## Improved SQL
        """
        def _extract_section(text: str, header: str) -> str:
            pattern = rf"##\s*{re.escape(header)}\s*\n(.*?)(?=##|\Z)"
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            return match.group(1).strip() if match else ""

        def _to_list(text: str) -> list[str]:
            """Split bullet-list text into individual items."""
            items = []
            for line in text.splitlines():
                line = re.sub(r"^[-*•]\s*", "", line).strip()
                if line and line.lower() != "none.":
                    items.append(line)
            return items

        summary     = _extract_section(raw, "Summary")
        issues_text = _extract_section(raw, "Issues")
        sugg_text   = _extract_section(raw, "Suggestions")
        improved    = _extract_section(raw, "Improved SQL")

        return {
            "raw":          raw,
            "summary":      summary,
            "issues":       _to_list(issues_text),
            "suggestions":  _to_list(sugg_text),
            "improved_sql": improved,
        }
