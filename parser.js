// Shared parsing functions for script.js and viewer.js

function escapeHTML(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Convert simple markdown-like markers to styled pills/tags
function parseAndPill(text) {
  const safe = escapeHTML(text || '');
  // **bold** -> strong pill
  let out = safe.replace(/\*\*(.+?)\*\*/g, (_m, p1) => `<strong class="pill-strong">${p1}</strong>`);
  // Lines starting with * item -> pill-item block
  out = out.replace(/^\*\s+(.+)$/gm, (_m, p1) => `<div class="pill-item">${p1}</div>`);
  // Newlines to <br>
  out = out.replace(/\r?\n/g, '<br>');
  return out;
}

function categoryClass(category) {
  const c = (category || '').toLowerCase();
  if (/911/.test(c)) return 'cat-911';
  if (/investigation/.test(c)) return 'cat-investigation';
  if (/interrogation/.test(c)) return 'cat-interrogation';
  if (/interview/.test(c)) return 'cat-interview';
  if (/cctv|footage/.test(c)) return 'cat-cctv';
  if (/body\s*cam/.test(c)) return 'cat-bodycam';
  if (/dash\s*cam/.test(c)) return 'cat-dashcam';
  return '';
}

// Smart category detection function with priority-based matching
function detectCategoryFromText(description, label = '') {
    if (!description && !label) return null;
    
    // Combine description and label for analysis
    const combinedText = `${description || ''} ${label || ''}`.toLowerCase().trim();
    if (!combinedText) return null;
    
    // Priority 1: Very specific patterns (highest priority to avoid false matches)
    // 911 CALLS - must be checked first before other call-related terms
    if (/\b911\b|\bemergency\s*call|\bdispatch\s*center|\bemergency\s*dispatch|\b911\s*operator|\bemergency\s*operator|\bemergency\s*response|\bpolice\s*dispatch/i.test(combinedText)) {
        return '911 CALLS';
    }
    
    // BODYCAM FOOTAGE - specific camera types (check before general camera terms)
    if (/\bbody\s*cam\b|\bbodycam\b|\bbody\s*camera|\bofficer\s*cam|\bofficer\s*camera|\bpolice\s*body\s*cam|\bworn\s*camera|\bchest\s*camera|\bshoulder\s*camera/i.test(combinedText)) {
        return 'BODYCAM FOOTAGE';
    }
    
    // DASHCAM FOOTAGE - vehicle-mounted cameras
    if (/\bdash\s*cam\b|\bdashcam\b|\bdashboard\s*camera|\bvehicle\s*cam|\bcar\s*camera|\bpolice\s*car\s*camera|\btraffic\s*stop|\broad\s*stop|\bhighway\s*patrol/i.test(combinedText)) {
        return 'DASHCAM FOOTAGE';
    }
    
    // CCTV FOOTAGE - surveillance cameras (check before other footage types)
    if (/\bcctv\b|\bsurveillance\s*camera|\bsecurity\s*camera|\bsecurity\s*footage|\bsurveillance\s*footage|\bsecurity\s*system|\bmonitoring\s*camera|\bstreet\s*camera|\bstore\s*camera|\bbuilding\s*camera/i.test(combinedText)) {
        return 'CCTV FOOTAGE';
    }
    
    // INTERROGATION - more adversarial/police questioning (check before interview)
    if (/\binterrogation\b|\binterrogating\b|\binterrogated\b|\bsuspect\s*questioning|\bpolice\s*questioning|\bconfession|\bdenial|\bMiranda\s*rights|\bright\s*to\s*remain\s*silent|\bcoercion|\bpressure\s*to\s*confess/i.test(combinedText)) {
        return 'INTERROGATION';
    }
    
    // INTERVIEW - more formal/neutral conversations (check after interrogation)
    if (/\binterview\b|\binterviewing\b|\binterviewed\b|\bwitness\s*interview|\bmedia\s*interview|\bjob\s*interview|\bformal\s*interview|\bqa\s*session|\bquestion\s*and\s*answer|\bprofessional\s*discussion|\bconversation\s*with/i.test(combinedText)) {
        return 'INTERVIEW';
    }
    
    // INVESTIGATION - crime scene and evidence work
    if (/\binvestigation\b|\binvestigating\b|\binvestigators?\b|\bcrime\s*scene|\bevidence\s*collection|\bevidence\s*gathering|\bdetective|\bforensic|\bscene\s*analysis|\bcase\s*development|\bkey\s*finding|\bbreakthrough|\bdiscovery\s*of\s*evidence/i.test(combinedText)) {
        return 'INVESTIGATION';
    }
    
    // Priority 2: Context-based detection (fallback for ambiguous cases)
    // If contains questioning/interview terms but also police/adversarial context
    if (/\bquestioning\b|\bquestioned\b/.test(combinedText)) {
        if (/\bpolice|\bofficer|\bsuspect|\baccused|\bconfession|\bdenial|\bMiranda/i.test(combinedText)) {
            return 'INTERROGATION';
        }
        if (/\bwitness|\bmedia|\bjournalist|\bformal|\bprofessional/i.test(combinedText)) {
            return 'INTERVIEW';
        }
    }
    
    // Camera-related but not specific enough - check context
    if (/\bcamera|\bfootage|\brecording|\bvideo/.test(combinedText)) {
        if (/\bpolice\s*officer|\bofficer\s*interaction|\bworn|\bbody/.test(combinedText)) {
            return 'BODYCAM FOOTAGE';
        }
        if (/\bvehicle|\bcar|\bdash|\btraffic|\broad/.test(combinedText)) {
            return 'DASHCAM FOOTAGE';
        }
        if (/\bsurveillance|\bsecurity|\bcctv|\bmonitoring/.test(combinedText)) {
            return 'CCTV FOOTAGE';
        }
    }
    
    return null; // No match found
}

function parseGeminiOutput(text) {
    if (!text) return { metadata: {}, timestamps: [], summary: '' };

    const lines = text.split(/\r?\n/);
    let metadata = {};
    let timestamps = [];
    let summary = '';

    let currentSection = '';
    let currentCategory = 'General';

    // A helper to strip asterisks and whitespace from the start/end
    const clean = (s) => (s || '').trim().replace(/^[\*\s]+|[\*\s]+$/g, '');

    for (const line of lines) {
        const trimmedLine = line.trim();
        const upperLine = trimmedLine.toUpperCase();

        if (trimmedLine.length === 0) continue;

        // *** FIX IS HERE: Reverted from startsWith to includes ***
        if (upperLine.includes('METADATA') && !upperLine.includes('EXTRACTION')) {
            currentSection = 'METADATA';
            continue;
        } else if (upperLine.includes('TIMESTAMPS')) {
            currentSection = 'TIMESTAMPS';
            continue;
        } else if (upperLine.includes('SUMMARY') || upperLine.includes('STORYLINE')) {
            currentSection = 'SUMMARY';
            
            // Clean the header line itself
            let summaryPart = line.split(/AND STORYLINE|SUMMARY/i).pop() || '';
            summaryPart = summaryPart.replace(/^[\*\s:]+/g, ''); // Remove `**:`
            
            if (summaryPart.trim()) {
                summary += summaryPart.trim() + '\n';
            }
            continue;
        }

        switch (currentSection) {
            case 'METADATA':
                const metaMatch = trimmedLine.match(/^[\*\-\s]*([^:]+?)\s*:\s*(.*)/);
                
                if (metaMatch && metaMatch[2] && metaMatch[2].trim()) {
                    const key = clean(metaMatch[1]);
                    const value = clean(metaMatch[2]);
                    
                    if (key && value && !/\[extracted.*\]/i.test(value)) {
                        metadata[key] = value;
                    }
                }
                break;

            case 'TIMESTAMPS':
                // Check for category header with count: "1. 911 CALLS (3)" or "911 CALLS (3)" or just category name
                // More flexible matching to catch various formats
                const categoryKeywords = ['911', 'CCTV', 'FOOTAGE', 'INTERROGATION', 'INTERVIEW', 'BODYCAM', 'DASHCAM', 'INVESTIGATION', 'CALLS', 'GENERAL'];
                
                // Pattern 1: With count in parentheses - normalize category name
                const countMatch = trimmedLine.match(/^\s*(?:\d+\.?\s*)?([A-Z0-9\s/&-]+?)\s*\((\d+)\)\s*$/i);
                if (countMatch && !trimmedLine.includes('[') && !trimmedLine.includes(':')) {
                    const potentialCategory = clean(countMatch[1]);
                    if (potentialCategory && categoryKeywords.some(kw => potentialCategory.toUpperCase().includes(kw))) {
                        // Normalize category name to standard format
                        let normalizedCategory = potentialCategory.toUpperCase();
                        if (/911|EMERGENCY.*CALL/i.test(normalizedCategory)) normalizedCategory = '911 CALLS';
                        else if (/CCTV|SURVEILLANCE/i.test(normalizedCategory)) normalizedCategory = 'CCTV FOOTAGE';
                        else if (/INTERROGATION/i.test(normalizedCategory)) normalizedCategory = 'INTERROGATION';
                        else if (/INTERVIEW/i.test(normalizedCategory)) normalizedCategory = 'INTERVIEW';
                        else if (/BODY.*CAM|BODYCAM/i.test(normalizedCategory)) normalizedCategory = 'BODYCAM FOOTAGE';
                        else if (/DASH.*CAM|DASHCAM/i.test(normalizedCategory)) normalizedCategory = 'DASHCAM FOOTAGE';
                        else if (/INVESTIGATION/i.test(normalizedCategory)) normalizedCategory = 'INVESTIGATION';
                        
                        currentCategory = normalizedCategory;
                        const count = parseInt(countMatch[2], 10) || 0;
                        if (!timestamps._categoryCounts) timestamps._categoryCounts = {};
                        timestamps._categoryCounts[currentCategory] = count;
                        continue;
                    }
                }
                
                // Pattern 2: Category name without count (more lenient) - normalize category name
                if (!trimmedLine.includes('[') && !trimmedLine.includes(':') && trimmedLine.length < 50) {
                    const upperTrimmed = trimmedLine.toUpperCase();
                    // Check if line contains known category keywords
                    for (const keyword of categoryKeywords) {
                        if (upperTrimmed.includes(keyword) && upperTrimmed.length < 30) {
                            // Extract the full category name
                            const categoryMatch = trimmedLine.match(/^\s*(?:\d+\.?\s*)?([A-Z0-9\s/&-]+?)\s*$/i);
                            if (categoryMatch) {
                                const potentialCategory = clean(categoryMatch[1]);
                                if (potentialCategory && potentialCategory.length > 2) {
                                    // Normalize category name
                                    let normalizedCategory = potentialCategory.toUpperCase();
                                    if (/911|EMERGENCY.*CALL/i.test(normalizedCategory)) normalizedCategory = '911 CALLS';
                                    else if (/CCTV|SURVEILLANCE/i.test(normalizedCategory)) normalizedCategory = 'CCTV FOOTAGE';
                                    else if (/INTERROGATION/i.test(normalizedCategory)) normalizedCategory = 'INTERROGATION';
                                    else if (/INTERVIEW/i.test(normalizedCategory)) normalizedCategory = 'INTERVIEW';
                                    else if (/BODY.*CAM|BODYCAM/i.test(normalizedCategory)) normalizedCategory = 'BODYCAM FOOTAGE';
                                    else if (/DASH.*CAM|DASHCAM/i.test(normalizedCategory)) normalizedCategory = 'DASHCAM FOOTAGE';
                                    else if (/INVESTIGATION/i.test(normalizedCategory)) normalizedCategory = 'INVESTIGATION';
                                    
                                    currentCategory = normalizedCategory;
                                    if (!timestamps._categoryCounts) timestamps._categoryCounts = {};
                                    timestamps._categoryCounts[currentCategory] = 0;
                                    continue;
                                }
                            }
                        }
                    }
                }
                
                // Match new timestamp format: [MM:SS - MM:SS] - [Short Label] - [Full Description]
                const tsMatch = trimmedLine.match(/\[([^\]]+)\]\s*-\s*([^-]+)\s*-\s*(.+)/);
                if (tsMatch) {
                    const timePart = clean(tsMatch[1]);
                    const shortLabel = clean(tsMatch[2]);
                    const fullDescription = clean(tsMatch[3]);
                    
                    // Smart category detection from description and label
                    let detectedCategory = detectCategoryFromText(fullDescription, shortLabel);
                    
                    // FIX: Prioritize the category Gemini already grouped this under.
                    // Only use text detection as a fallback if the group is 'General'.
                    const finalCategory = (currentCategory !== 'General' && currentCategory !== 'GENERAL') 
                                            ? currentCategory 
                                            : (detectedCategory || 'General');
                    
                    timestamps.push({
                        time: timePart,
                        label: shortLabel || '',
                        description: fullDescription || shortLabel || 'No description',
                        category: finalCategory
                    });
                } else {
                    // Fallback for old format: [MM:SS - MM:SS] - Description
                    const oldTsMatch = trimmedLine.match(/\[([^\]]+)\]\s*-?\s*(.+)?/);
                    if (oldTsMatch) {
                        const timePart = clean(oldTsMatch[1]);
                        let description = (oldTsMatch[2] || '').trim();
                        if (!description || description.length === 0) {
                            description = 'Timestamp marker';
                        }
                        
                        // Smart category detection from description
                        let detectedCategory = detectCategoryFromText(description);
                        
                        const finalCategory = (currentCategory !== 'General' && currentCategory !== 'GENERAL')
                                              ? currentCategory
                                              : (detectedCategory || 'General');
                        
                        timestamps.push({
                            time: timePart,
                            label: '',
                            description: clean(description) || 'No description',
                            category: finalCategory
                        });
                    }
                }
                break;

            case 'SUMMARY':
                summary += line + '\n';
                break;
        }
    }
    
    // Final cleanup of the whole summary string
    const finalSummary = summary.trim().replace(/^[\*\s]+|[\*\s]+$/g, '');
    
    // Extract category counts if they exist
    const categoryCounts = timestamps._categoryCounts || {};
    // Remove the temporary _categoryCounts property
    const cleanTimestamps = timestamps.filter(t => t && t.time);
    
    return { metadata, timestamps: cleanTimestamps, summary: finalSummary, categoryCounts };
}

function timeToSeconds(ts) {
  // Get just the start time, e.g., "00:45 - 01:00" -> "00:45"
  const startTime = (ts || '').split(' - ')[0].trim(); 
  
  const parts = (startTime || '').split(':').map(x => parseInt(x, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function buildStructuredOutput(text, timestampCardsContainer, summaryEl, metaTableWrap, metaBody, passesFilter = () => true, filterLabel = () => '') {
  if (!text || !text.trim()) {
    // Clear everything if no text
    if (timestampCardsContainer) timestampCardsContainer.innerHTML = '';
    if (summaryEl) summaryEl.innerHTML = '—';
    if (metaTableWrap) metaTableWrap.classList.add('hidden');
    return;
  }

  const { metadata, timestamps, summary, categoryCounts } = parseGeminiOutput(text);

  if (summaryEl) {
    summaryEl.innerHTML = parseAndPill(summary || '—');
  }

  if (Object.keys(metadata).length > 0) {
    if (metaTableWrap) metaTableWrap.classList.remove('hidden');
    if (metaBody) {
      let metaHtml = '';
      for (const [key, value] of Object.entries(metadata)) {
        metaHtml += `<tr><td><span class="pill-key">${escapeHTML(key)}</span></td><td>${parseAndPill(value)}</td></tr>`;
      }
      metaBody.innerHTML = metaHtml;
    }
  } else {
    if (metaTableWrap) metaTableWrap.classList.add('hidden');
    if (metaBody) metaBody.innerHTML = '';
  }
  
  // Group timestamps by category (normalize to uppercase for consistency)
  const grouped = timestamps.reduce((acc, ts) => {
    let cat = (ts.category || 'General').trim();
    // Normalize category names to match expected format
    if (/911|emergency/i.test(cat)) cat = '911 CALLS';
    else if (/cctv|surveillance/i.test(cat)) cat = 'CCTV FOOTAGE';
    else if (/interrogation/i.test(cat)) cat = 'INTERROGATION';
    else if (/interview/i.test(cat)) cat = 'INTERVIEW';
    else if (/body\s*cam|bodycam/i.test(cat)) cat = 'BODYCAM FOOTAGE';
    else if (/dash\s*cam|dashcam/i.test(cat)) cat = 'DASHCAM FOOTAGE';
    else if (/investigation/i.test(cat)) cat = 'INVESTIGATION';
    else cat = cat.toUpperCase();
    
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ts);
    return acc;
  }, {});

  // Check for "No [CATEGORY] timestamps were found" messages in the text
  const categoryNotFoundMessages = [];
  const expectedCategories = ['911 CALLS', 'CCTV FOOTAGE', 'INTERROGATION', 'INTERVIEW', 'BODYCAM FOOTAGE', 'DASHCAM FOOTAGE', 'INVESTIGATION'];
  
  for (const expectedCat of expectedCategories) {
    const normalizedCat = expectedCat.toLowerCase().replace(/\s+/g, ' ');
    const foundInText = text.toLowerCase().includes(`no ${normalizedCat}`) || 
                       text.toLowerCase().includes(`${normalizedCat} not found`) ||
                       text.toLowerCase().includes(`no ${normalizedCat} timestamp`);
    
    const catKey = Object.keys(grouped).find(k => k.toLowerCase().includes(normalizedCat.split(' ')[0]));
    
    if (foundInText || (!catKey || grouped[catKey]?.length === 0)) {
      categoryNotFoundMessages.push(expectedCat);
    }
  }

  // Build the card grid HTML with accordion headers
  let cardsHtml = '';
  
  // Sort categories: specific categories first, then GENERAL last
  const categoryOrder = ['911 CALLS', 'CCTV FOOTAGE', 'INTERROGATION', 'INTERVIEW', 'BODYCAM FOOTAGE', 'DASHCAM FOOTAGE', 'INVESTIGATION', 'GENERAL'];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIndex = categoryOrder.findIndex(c => c === a.toUpperCase());
    const bIndex = categoryOrder.findIndex(c => c === b.toUpperCase());
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  // Get all categories that should be displayed (with timestamps or not found)
  const allCategoriesToShow = new Set(sortedCategories);
  categoryNotFoundMessages.forEach(cat => allCategoriesToShow.add(cat));
  
  // Convert to array and sort by categoryOrder
  const allCategoriesSorted = Array.from(allCategoriesToShow).sort((a, b) => {
    const aIndex = categoryOrder.findIndex(c => c === a.toUpperCase());
    const bIndex = categoryOrder.findIndex(c => c === b.toUpperCase());
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  // Process categories with timestamps
  for (const category of allCategoriesSorted) {
    const items = grouped[category] || [];
    const hasItems = items && items.length > 0;
    const isNotFound = categoryNotFoundMessages.includes(category);
    
    // Skip if filtering and doesn't pass filter (but still increment number for correct sequence)
    if (hasItems && !passesFilter(category)) {
      continue; // Skip this category but don't increment number
    }
    
    // Skip if empty and not in notFound list
    if (!hasItems && !isNotFound) {
      continue; // Skip this category but don't increment number
    }
    
    const catClass = categoryClass(category);
    const categoryUpper = escapeHTML(category.toUpperCase());
    
    // Always use actual items.length as the count (source of truth)
    // This ensures the displayed count matches the actual number of timestamp cards
    const count = hasItems ? items.length : 0;
    
    // Build card grid items: time pill on top, description below
    const cardItems = hasItems ? items.map(it => {
      const timeStr = escapeHTML(it.time || '');
      const descStr = escapeHTML(it.description || it.label || 'No description');
      
      return `<div class="timestamp-card ${catClass}" data-category="${escapeHTML(category)}">
        <button class="link ts-jump" data-ts="${timeStr}" style="border: none; background: none; padding: 0; cursor: pointer; width: 100%; text-align: left;">
          <span class="pill-time">${timeStr}</span>
          <div class="ts-desc">${descStr}</div>
        </button>
      </div>`;
    }).join('') : '';
    
    cardsHtml += `<div class="timestamp-category-group collapsed" data-category="${escapeHTML(category)}">
      <button class="timestamp-category-title" data-category="${escapeHTML(category)}" type="button">
        <span class="category-arrow">▶</span>
        <span class="category-name">${categoryUpper} (${count})</span>
      </button>
      <div class="timestamp-card-list hidden">
        ${hasItems ? cardItems : `<div class="muted" style="padding: 20px; text-align: center;">No ${escapeHTML(category)} timestamps were found in this video.</div>`}
      </div>
    </div>`;
  }
  
  // Render to container
  if (timestampCardsContainer) {
    const hasTimestamps = timestamps && timestamps.length > 0;
    
    if (!hasTimestamps && categoryNotFoundMessages.length === 0) {
      timestampCardsContainer.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">No timestamps detected yet.</div>`;
    } else {
      timestampCardsContainer.innerHTML = cardsHtml || `<div class="muted" style="padding: 20px; text-align: center;">No timestamps detected yet.</div>`;
      
      // Attach click handlers for accordion functionality (only one category open at a time)
      const categoryButtons = timestampCardsContainer.querySelectorAll('.timestamp-category-title');
      categoryButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const categoryGroup = btn.closest('.timestamp-category-group');
          if (categoryGroup) {
            const isCollapsed = categoryGroup.classList.contains('collapsed');
            const arrow = btn.querySelector('.category-arrow');
            const cardList = categoryGroup.querySelector('.timestamp-card-list');
            
            // If opening this category, close all others first
            if (isCollapsed) {
              // Close all other categories
              const allGroups = timestampCardsContainer.querySelectorAll('.timestamp-category-group');
              allGroups.forEach(group => {
                if (group !== categoryGroup) {
                  group.classList.remove('expanded');
                  group.classList.add('collapsed');
                  const otherCardList = group.querySelector('.timestamp-card-list');
                  if (otherCardList) otherCardList.classList.add('hidden');
                  const otherArrow = group.querySelector('.category-arrow');
                  if (otherArrow) otherArrow.textContent = '▶';
                }
              });
              
              // Open the clicked category
              categoryGroup.classList.remove('collapsed');
              categoryGroup.classList.add('expanded');
              if (cardList) cardList.classList.remove('hidden');
              if (arrow) arrow.textContent = '▼';
            } else {
              // Close the clicked category
              categoryGroup.classList.remove('expanded');
              categoryGroup.classList.add('collapsed');
              if (cardList) cardList.classList.add('hidden');
              if (arrow) arrow.textContent = '▶';
            }
          }
        });
      });
    }
    
    // Show the timestamps section
    const timestampsSection = document.getElementById('timestamps');
    if (timestampsSection) {
      if (hasTimestamps || categoryNotFoundMessages.length > 0) {
        timestampsSection.classList.remove('hidden');
      } else {
        timestampsSection.classList.add('hidden');
      }
    }
  }
}

// Export functions for use in other files (ES6 modules)
export { escapeHTML, parseAndPill, categoryClass, parseGeminiOutput, timeToSeconds, buildStructuredOutput };

// Also support CommonJS for compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHTML,
    parseAndPill,
    categoryClass,
    parseGeminiOutput,
    timeToSeconds,
    buildStructuredOutput
  };
}

