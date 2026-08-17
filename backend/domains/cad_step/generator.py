"""CAD Step domain item synthesis & Text-to-CAD reference model generator engine."""
from typing import Any, Dict, List
import re
from backend.domains.cad_step.schema import CadConstraint, CadStepItemPayload


def generate_cad_step_payload_from_prompt(
    prompt: str,
    region_standard: str = "ISO",
    unit_system: str = "metric",
    viva_required: bool = True,
    ai_generated_data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Synthesize a validated CadStepItemPayload item from a prompt & optional AI output.
    Fallback parser extracts geometric dimensions (mm, inches, diameters, thickness)
    if AI generated data is absent.
    """
    unit = "mm" if unit_system.lower() == "metric" else "in"
    
    if ai_generated_data:
        cad_brief = ai_generated_data.get("cad_brief") or f"Model the following mechanical part per specification: {prompt}"
        raw_constraints = ai_generated_data.get("constraints", [])
        constraints = [
            CadConstraint(
                name=c.get("name", "Geometric Dimension"),
                target_value=float(c.get("target_value", 10.0)),
                tolerance=float(c.get("tolerance", 0.05)),
                unit=c.get("unit", unit),
            )
            for c in raw_constraints
        ]
        parametric_code = ai_generated_data.get("parametric_code") or ""
    else:
        # Heuristic extraction of geometric parameters from text prompt
        cad_brief = (
            f"Engineering Specification:\n"
            f"Design and model a 3D CAD part based on the following requirement:\n"
            f"\"{prompt}\"\n\n"
            f"Ensure all sketches are fully defined, comply with {region_standard} drafting standards, "
            f"and maintain specified tolerances using {unit_system} units."
        )
        
        constraints: List[CadConstraint] = []
        
        # Regex extraction of dimensions (e.g. 50x30mm, 10mm hole, R5 fillet)
        box_match = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", prompt, re.IGNORECASE)
        if box_match:
            val1 = float(box_match.group(1))
            val2 = float(box_match.group(2))
            constraints.append(CadConstraint(name="Length / Width D1", target_value=val1, tolerance=0.1, unit=unit))
            constraints.append(CadConstraint(name="Length / Width D2", target_value=val2, tolerance=0.1, unit=unit))
            
        dia_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mm|in)?\s*(?:hole|bore|diameter|dia|M\d+)", prompt, re.IGNORECASE)
        if dia_match:
            constraints.append(CadConstraint(name="Hole / Bore Diameter", target_value=float(dia_match.group(1)), tolerance=0.05, unit=unit))

        thickness_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mm|in)?\s*(?:thick|thickness|height|depth)", prompt, re.IGNORECASE)
        if thickness_match:
            constraints.append(CadConstraint(name="Plate / Feature Thickness", target_value=float(thickness_match.group(1)), tolerance=0.05, unit=unit))

        # Fallback default constraints if none parsed
        if not constraints:
            constraints = [
                CadConstraint(name="Bounding Length X", target_value=50.0, tolerance=0.1, unit=unit),
                CadConstraint(name="Bounding Width Y", target_value=30.0, tolerance=0.1, unit=unit),
                CadConstraint(name="Feature Diameter", target_value=10.0, tolerance=0.05, unit=unit),
            ]
            
        parametric_code = (
            f"# build123d / CadQuery Parametric Construction Script\n"
            f"# Generated for prompt: {prompt}\n"
            f"import build123d as b3d\n\n"
            f"with b3d.BuildPart() as part:\n"
            f"    b3d.Box({constraints[0].target_value}, {constraints[1].target_value if len(constraints) > 1 else 30.0}, 10.0)\n"
            f"    # Extrude features and apply constraints\n"
            f"export_step(part.part, 'reference_model.step')\n"
        )

    payload = CadStepItemPayload(
        prompt=prompt,
        cad_brief=cad_brief,
        constraints=constraints,
        reference_file_url="https://storage.codespectra.io/cad/reference_models/auto_generated_ref.step",
        viva_required=viva_required,
        region_standard=region_standard,
        unit_system=unit_system,
    )

    result = payload.model_dump()
    result["parametric_code"] = parametric_code
    return result
