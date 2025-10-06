# MedRAX Tools - Complex Test Questions & Edge Cases

## Available Test Images:
- **Normal X-rays:** demo/chest/normal1.jpg, normal2.jpg, normal3.jpg, normal4.jpg, normal5.jpg, normal6.jpg
- **Pneumonia X-rays:** demo/chest/pneumonia1.jpg, pneumonia2.jpg, pneumonia3.jpg, pneumonia4.jpg, pneumonia5.jpg  
- **Effusion:** demo/chest/effusion1.png
- **DICOM files:** demo/chest/LIDC.dcm, RIDER.dcm, TCGAA.dcm, Pseudo.dcm

---

## 1. ImageVisualizerTool Test Questions

### Basic Tests:
- Display this chest X-ray: demo/chest/normal1.jpg
- Show me this medical image: demo/chest/pneumonia1.jpg
- Visualize this DICOM file: demo/chest/LIDC.dcm

### Edge Cases:
- Compare these two X-rays side by side: demo/chest/normal1.jpg and demo/chest/pneumonia1.jpg
- Display this image with maximum resolution: demo/chest/effusion1.png
- Show me this non-existent image: demo/chest/fake.jpg
- Visualize this corrupted path: /invalid/path/test.jpg

---

## 2. DicomProcessorTool Test Questions

### Basic Tests:
- Process this DICOM file: demo/chest/LIDC.dcm
- Extract metadata from: demo/chest/RIDER.dcm
- Convert this DICOM to JPG: demo/chest/TCGAA.dcm

### Complex Cases:
- Analyze DICOM header and tell me patient age, study date, imaging parameters from demo/chest/LIDC.dcm
- Process this DICOM file and extract all technical parameters including kVp, mAs, slice thickness: demo/chest/RIDER.dcm
- Convert demo/chest/Pseudo.dcm to PNG format and preserve all metadata
- Compare DICOM headers between demo/chest/LIDC.dcm and demo/chest/RIDER.dcm

### Edge Cases:
- Process this regular image as DICOM: demo/chest/normal1.jpg
- Handle this potentially corrupted DICOM: demo/chest/TCGAA.dcm
- Extract metadata from non-existent file: demo/chest/missing.dcm

---

## 3. ChestXRayClassifierTool Test Questions

### Basic Tests:
- Classify this chest X-ray: demo/chest/normal1.jpg
- Detect abnormalities in: demo/chest/pneumonia1.jpg
- Analyze pathology in: demo/chest/effusion1.png

### Complex Multi-pathology Cases:
- Classify this X-ray for all 14 pathology categories with confidence scores: demo/chest/pneumonia2.jpg
- Perform comprehensive pathology screening including pneumonia, effusion, atelectasis, consolidation, edema: demo/chest/pneumonia3.jpg
- Analyze this X-ray for subtle findings and provide differential diagnosis: demo/chest/normal2.jpg

### Edge Cases:
- Classify this potentially low-quality image: demo/chest/normal6.jpg
- Analyze this X-ray for rare pathologies: demo/chest/pneumonia4.jpg
- What if this image shows multiple overlapping pathologies: demo/chest/pneumonia5.jpg
- Classify confidence when image quality is suboptimal: demo/chest/normal5.jpg

---

## 4. ChestXRaySegmentationTool Test Questions

### Basic Tests:
- Segment lung regions in: demo/chest/normal1.jpg
- Identify heart boundaries in: demo/chest/normal2.jpg
- Segment anatomical structures in: demo/chest/pneumonia1.jpg

### Complex Multi-organ Cases:
- Segment lungs, heart, diaphragm, and rib cage in: demo/chest/normal3.jpg
- Perform complete thoracic segmentation including all visible organs: demo/chest/pneumonia2.jpg
- Segment anatomical structures while accounting for pathological changes: demo/chest/effusion1.png

### Edge Cases:
- Segment this rotated or poorly positioned X-ray: demo/chest/normal4.jpg
- Handle segmentation when pathology obscures normal anatomy: demo/chest/pneumonia3.jpg
- Segment structures in this low-contrast image: demo/chest/normal5.jpg
- What happens with segmentation on unusual patient positioning: demo/chest/pneumonia4.jpg

---

## 5. ChestXRayReportGeneratorTool Test Questions

### Basic Tests:
- Generate radiology report for: demo/chest/normal1.jpg
- Create medical report for: demo/chest/pneumonia1.jpg
- Write comprehensive analysis of: demo/chest/effusion1.png

### Complex Clinical Cases:
- Generate detailed radiology report including clinical correlation for: demo/chest/pneumonia2.jpg
- Create report focusing on urgent/critical findings in: demo/chest/pneumonia3.jpg
- Write comparative analysis report suggesting follow-up imaging for: demo/chest/effusion1.png
- Generate report considering both adult and pediatric possibilities: demo/chest/normal2.jpg

### Edge Cases:
- Write report for technically limited study: demo/chest/normal6.jpg
- Generate report when multiple pathologies are present: demo/chest/pneumonia4.jpg
- Create report for ambiguous findings requiring further workup: demo/chest/normal5.jpg
- Handle report generation for poor image quality: demo/chest/pneumonia5.jpg

---

## 6. XRayVQATool Test Questions

### Basic VQA:
- What organs are visible in this chest X-ray? demo/chest/normal1.jpg
- Is there pneumonia in this image? demo/chest/pneumonia1.jpg
- Describe the heart size in: demo/chest/normal2.jpg

### Complex Multi-part Questions:
- In this X-ray, identify: 1) all anatomical landmarks, 2) any pathological findings, 3) image quality assessment, 4) recommended additional views: demo/chest/pneumonia2.jpg
- What is the cardiothoracic ratio, lung volume status, and any abnormal opacities in: demo/chest/normal3.jpg
- Evaluate technical factors: penetration, positioning, inspiration, rotation in: demo/chest/pneumonia3.jpg

### Advanced Clinical Questions:
- What are the differential diagnoses for findings in: demo/chest/effusion1.png
- How would you grade the severity of pathology in: demo/chest/pneumonia4.jpg
- What follow-up imaging would you recommend based on: demo/chest/pneumonia5.jpg
- Compare expected vs actual findings in: demo/chest/normal4.jpg

### Edge Cases:
- Answer complex question about subtle findings in: demo/chest/normal5.jpg
- Handle ambiguous visual question about: demo/chest/normal6.jpg
- What if asked about findings not visible in: demo/chest/normal1.jpg

---

## 7. LlavaMedTool Test Questions

### Advanced Medical Analysis:
- Provide comprehensive medical analysis including pathophysiology: demo/chest/pneumonia1.jpg
- Explain underlying disease mechanisms visible in: demo/chest/effusion1.png
- Give clinical decision support and management recommendations for: demo/chest/pneumonia2.jpg

### Educational & Teaching Cases:
- Explain this X-ray as if teaching medical students: demo/chest/normal1.jpg
- Discuss pathophysiology and clinical correlation for: demo/chest/pneumonia3.jpg
- Provide case-based learning discussion for: demo/chest/effusion1.png

### Complex Clinical Reasoning:
- What is the prognosis and recommended follow-up for: demo/chest/pneumonia4.jpg
- Analyze this case for evidence-based treatment recommendations: demo/chest/pneumonia5.jpg
- Provide differential diagnosis with likelihood rankings for: demo/chest/normal2.jpg

### Edge Cases:
- Handle complex pathophysiology explanation for rare findings in: demo/chest/normal3.jpg
- Provide analysis when image quality limits interpretation: demo/chest/normal6.jpg
- What about contradictory clinical vs imaging findings discussion: demo/chest/normal5.jpg

---

## 8. XRayPhraseGroundingTool Test Questions

### Basic Anatomical Grounding:
- Locate "right lower lobe" in: demo/chest/normal1.jpg
- Highlight "cardiac silhouette" in: demo/chest/normal2.jpg
- Find "costophrenic angles" in: demo/chest/normal3.jpg

### Pathology Grounding:
- Ground "consolidation" in: demo/chest/pneumonia1.jpg
- Locate "pleural effusion" in: demo/chest/effusion1.png
- Find "air bronchograms" in: demo/chest/pneumonia2.jpg

### Complex Multi-structure Grounding:
- Locate both "cardiac silhouette" and "costophrenic angles" in: demo/chest/normal1.jpg
- Ground "retrocardiac opacity" and "left hemidiaphragm" in: demo/chest/pneumonia3.jpg
- Find "bilateral lower lobe consolidation" in: demo/chest/pneumonia4.jpg

### Advanced Medical Terminology:
- Ground "retrocardiac opacity" in: demo/chest/pneumonia3.jpg
- Locate "pneumatoceles" in: demo/chest/pneumonia4.jpg
- Find "Kerley B lines" in: demo/chest/effusion1.png
- Ground "silhouette sign" in: demo/chest/pneumonia5.jpg

### Edge Cases:
- Verify absence of "pneumothorax" in: demo/chest/normal1.jpg
- Ground "subtle infiltrate" in: demo/chest/normal4.jpg
- Locate "questionable nodule" in: demo/chest/normal5.jpg
- Handle grounding of "bilateral pleural effusions" when only unilateral: demo/chest/effusion1.png

---

## Multi-Tool Complex Scenarios:

### Scenario 1: Complete Workup
1. Visualize: demo/chest/pneumonia1.jpg
2. Classify pathology with confidence scores
3. Segment affected lung regions  
4. Generate comprehensive report
5. Answer: "What's the most likely organism causing this pneumonia?"
6. Ground: "consolidation" and "air bronchograms"
7. LLaVA-Med: Clinical management recommendations

### Scenario 2: Comparative Analysis
1. Compare: demo/chest/normal1.jpg vs demo/chest/pneumonia1.jpg
2. Classify both for pathology differences
3. Generate comparative report
4. VQA: "What changes occurred between these images?"
5. Ground: differences in lung opacity

### Scenario 3: DICOM Workflow
1. Process DICOM: demo/chest/LIDC.dcm
2. Convert to viewable format
3. Classify the converted image
4. Generate radiology report
5. Advanced analysis with LLaVA-Med

### Scenario 4: Edge Case Handling
1. Try to process: demo/chest/normal1.jpg as DICOM
2. Classify: non-existent image path
3. Generate report for: corrupted image
4. VQA on: severely degraded image quality
5. Ground: non-existent anatomical terms

---

## Quick Test Commands:

### Copy-paste ready questions:
```
Display this chest X-ray: demo/chest/normal1.jpg

Classify this chest X-ray for all pathology categories: demo/chest/pneumonia1.jpg

What anatomical structures and pathological findings are visible in this chest X-ray? demo/chest/effusion1.png

Generate a comprehensive radiology report for this chest X-ray: demo/chest/pneumonia2.jpg

Segment all anatomical structures in this chest X-ray: demo/chest/normal2.jpg

Locate and highlight the "cardiac silhouette" and "costophrenic angles" in this chest X-ray: demo/chest/normal1.jpg

Provide advanced medical analysis including pathophysiology and clinical recommendations for: demo/chest/pneumonia3.jpg

Process this DICOM file and extract all metadata: demo/chest/LIDC.dcm
```
