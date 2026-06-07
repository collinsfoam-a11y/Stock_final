import os
from collections import defaultdict
import json

def analyze_py_files(directory):
    total_lines = 0
    total_files = 0
    
    # Very naive duplicate detection
    block_counts = defaultdict(list)
    
    for root, _, files in os.walk(directory):
        if 'tests' in root.split(os.sep) or 'test' in root.split(os.sep):
            continue
            
        for file in files:
            if file.endswith('.py') and not file.startswith('test_'):
                filepath = os.path.join(root, file)
                total_files += 1
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        lines = content.split('\n')
                        total_lines += len(lines)
                        
                        # Find 10-line blocks for duplicate detection
                        for i in range(len(lines) - 10):
                            block = '\n'.join([line.strip() for line in lines[i:i+10] if line.strip()])
                            if len(block.split('\n')) >= 5: # Only count dense blocks
                                block_counts[block].append((filepath, i))
                except Exception as e:
                    pass
                    
    # Process duplicates
    duplicates = {k: v for k, v in block_counts.items() if len(v) > 1 and len(set([x[0] for x in v])) > 1}
    
    return {
        'total_files': total_files,
        'total_lines': total_lines,
        'duplicate_groups': len(duplicates),
        'duplicates': duplicates
    }

if __name__ == "__main__":
    backend_stats = analyze_py_files('backend')
    print("BACKEND STATS (EXCLUDING TESTS):")
    print(f"Files: {backend_stats['total_files']}")
    print(f"Lines: {backend_stats['total_lines']}")
    print(f"Duplicate Groups: {backend_stats['duplicate_groups']}")
    
    # Sort duplicates by number of occurrences
    sorted_dups = sorted(backend_stats['duplicates'].items(), key=lambda x: len(x[1]), reverse=True)
    
    print("\nTOP 5 DUPLICATE BLOCKS:")
    for i, (block, occurrences) in enumerate(sorted_dups[:5]):
        print(f"\n--- Rank {i+1} (Found {len(occurrences)} times) ---")
        print(block)
        print("Files:")
        # Dedup files
        files_seen = set()
        unique_occs = []
        for occ in occurrences:
            if occ[0] not in files_seen:
                files_seen.add(occ[0])
                unique_occs.append(occ)
        
        for fp, line in unique_occs[:5]:
            print(f"  {fp}:{line}")
        if len(unique_occs) > 5:
            print(f"  ... and {len(unique_occs) - 5} more")
