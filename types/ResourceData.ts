export type DropRate = {
    code: string;
    rate: number;
    min_quantity: number;
    max_quantity: number;
}

export type Resource = {
    name: string;
    code: string;
    skill: string;
    level: number;
    drops: DropRate[]
}

/**
 * https://api.artifactsmmo.com/docs/#/operations/get_all_resources_resources_get
 */
export type ResourceQueryParameters = {
    drop?: string
    max_level?: number
    min_level?: number
    page?: number
    size?: number
    skill?: string
}