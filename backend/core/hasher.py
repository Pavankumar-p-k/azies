import hashlib


def generate_hash(data: bytes, chunk_size: int = 8192) -> str:
    sha3 = hashlib.sha3_512()
    for index in range(0, len(data), chunk_size):
        sha3.update(data[index : index + chunk_size])
    return sha3.hexdigest()
