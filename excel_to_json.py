import pandas as pd
import json
import numpy as np
from datetime import datetime, date

# --- 配置 ---
excel_file_path = '/Users/xiongtao/Documents/招聘网站信息/招聘文本分类呀/汇总招聘信息.xlsx'  # 你的 Excel 文件路径
json_file_path = 'jobs_data.json'  # 输出的 JSON 文件名
sheet_name = 0  # Excel 工作表索引或名称

# 列名常量，与 Excel 表头对应
COL_PUB_DATE = '发布日期'
COL_DEADLINE = '截止日期'
COL_PROCESS_TIME = '处理时间'
# 如果还有其他日期列，在这里定义并添加到下面的 date_columns_config 中

# 日期列的配置: {列名: 输出格式}
# %Y-%m-%d 表示 年-月-日
# %Y-%m-%d %H:%M:%S 表示 年-月-日 时:分:秒
date_columns_config = {
    COL_PUB_DATE: '%Y-%m-%d',
    COL_DEADLINE: '%Y-%m-%d',  # 截止日期也会先尝试按此格式转换
    COL_PROCESS_TIME: '%Y-%m-%d %H:%M:%S'
}

DEFAULT_EMPTY_DEADLINE_TEXT = "长期/招满即止"


# --- 配置结束 ---

def safe_convert_to_datetime_and_format(value, target_format):
    """
    尝试将值转换为 datetime 对象，然后格式化为字符串。
    如果转换失败或值为空，则返回 None。
    """
    if pd.isna(value):  # 处理 None, NaN, NaT
        return None
    try:
        # 首先尝试直接将值转换为 datetime 对象
        # pd.to_datetime 可以处理多种输入格式，包括已是 datetime 对象的情况
        dt_object = pd.to_datetime(value, errors='raise')  # errors='raise' 如果无法转换则报错
        return dt_object.strftime(target_format)
    except (ValueError, TypeError):
        # 如果直接转换失败 (例如，它已经是特定格式的字符串但 pd.to_datetime 无法识别，或者非日期类型)
        # 或许可以尝试更宽松的解析，但通常 pandas 读 Excel 时日期列会是 Timestamp 或 NaT
        # 对于已经是字符串但格式不佳的情况，可能需要更复杂的解析逻辑
        # 但我们主要依赖 pandas 读取时的转换。如果已经是字符串，且格式符合预期，直接返回。
        if isinstance(value, str):
            # 简单检查下字符串是否是空的，如果是，也当作None
            if not value.strip():
                return None
            # 这里的逻辑是：如果已经是字符串，我们假设它已经是期望的格式或接近期望的格式
            # 如果需要对特定格式的字符串进行再解析和格式化，需要更复杂的逻辑
            # 但鉴于 pandas 的读取能力，这一步主要是捕获那些不是日期类型的值
            # print(f"Warning: Value '{value}' for date column could not be parsed as datetime, keeping as is or returning None.")
            # 简单返回原始值，后续 None 处理会捕获
            return None  # 或者返回 str(value) 如果你想保留非标准字符串
    return None  # 默认返回 None


try:
    # 读取 Excel 文件，将标准空值识别为 NaN
    df = pd.read_excel(excel_file_path, sheet_name=sheet_name, keep_default_na=True, na_filter=True)
    df.columns = df.columns.astype(str)  # 确保列名是字符串

    # 1. 处理日期列
    for col_name, fmt_str in date_columns_config.items():
        if col_name in df.columns:
            # 对每一行应用转换函数
            df[col_name] = df[col_name].apply(lambda x: safe_convert_to_datetime_and_format(x, fmt_str))

    # 2. 特殊处理“截止日期”的空值
    if COL_DEADLINE in df.columns:
        # 将转换后依然是 None (代表原始空值或无法解析的日期) 的“截止日期”替换为特定文本
        # 注意：这里是在日期格式化之后操作，所以 None 代表的是原始的空或解析失败
        df[COL_DEADLINE] = df[COL_DEADLINE].fillna(DEFAULT_EMPTY_DEADLINE_TEXT)
        # 如果 safe_convert_to_datetime_and_format 对于无法解析的返回了原始非空字符串，
        # 而你希望这些非标准日期也被替换，逻辑需要调整。
        # 但通常，如果 Excel 里是空的，pd.read_excel 会读为 NaN/None，safe_convert 会返回 None。

    # 3. 将 DataFrame 中的所有 np.nan (通常是 float 类型) 和 pd.NA (如果存在)
    #    替换为 Python 的 None，以便 json.dump 能正确处理为 JSON null。
    #    日期列的 None 已经在上面处理过了。这里主要处理其他非日期列的 NaN。
    #    df.fillna(value=np.nan, inplace=True) # 确保所有空都是np.nan
    #    df = df.replace({np.nan: None})
    #    更稳妥的方式是在转换为字典后处理：

    records = df.to_dict(orient='records')

    processed_records = []
    for record in records:
        processed_record = {}
        for key, value in record.items():
            # 检查是否是 float('nan')
            if isinstance(value, float) and np.isnan(value):
                processed_record[key] = None  # 转为 Python None -> JSON null
            # 检查是否是 pandas.NaT (在 to_dict 之后通常是 None)
            elif pd.isna(value) and isinstance(value, pd.Timestamp):  # NaT
                processed_record[key] = None
            # 检查是否是 pandas.NA (较新的缺失值标记)
            elif value is pd.NA:
                processed_record[key] = None
            else:
                processed_record[key] = value
        processed_records.append(processed_record)

    final_records = processed_records

    # 将处理后的字典列表写入 JSON 文件
    with open(json_file_path, 'w', encoding='utf-8') as f:
        json.dump(final_records, f, ensure_ascii=False, indent=4)

    print(f"成功将 Excel 文件 '{excel_file_path}' 转换为 JSON 文件 '{json_file_path}'")
    print(f"共转换了 {len(final_records)} 条记录。")

except FileNotFoundError:
    print(f"错误：未找到 Excel 文件 '{excel_file_path}'。请检查文件名和路径是否正确。")
except Exception as e:
    print(f"处理过程中发生错误：{e}")
    import traceback

    traceback.print_exc()  # 打印详细的堆栈跟踪信息
    if 'df' in locals():
        print("\nDataFrame 数据类型信息:")
        print(df.dtypes)